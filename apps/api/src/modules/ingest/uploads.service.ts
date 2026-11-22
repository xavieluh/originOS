import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  ACCEPTED_MEDIA_TYPES,
  type UploadErrorCode,
  type UploadView,
  newUploadId,
} from "@originos/contracts";
import { type Db, enqueueJob, schema, withScope } from "@originos/db";
import {
  SNIFF_BYTES,
  type Storage,
  StorageUnavailable,
  UploadRefused,
  checkDeclared,
  readLimited,
  sanitizeFilename,
  sha256Hex,
  sniffType,
  uploadKey,
} from "@originos/storage";
import { desc, eq } from "drizzle-orm";
import {
  APP_DB,
  ApiError,
  type Principal,
  type TenantContext,
  conflict,
  notFound,
  recordAudit,
} from "../core/index.js";
import { STORAGE } from "./tokens.js";

const { uploads, users } = schema;
export const SCAN_UPLOAD_JOB = "ingest.scan_upload";

type UploadRow = typeof uploads.$inferSelect;

const STATUS_FOR: Partial<Record<UploadErrorCode, HttpStatus>> = {
  too_large: HttpStatus.PAYLOAD_TOO_LARGE,
  type_not_accepted: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  type_mismatch: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
};

/** A refusal the person sees: stable code plus a sentence. */
function refusal(error: UploadRefused): ApiError {
  return new ApiError(STATUS_FOR[error.code] ?? HttpStatus.BAD_REQUEST, error.code, error.message);
}

const storageNotSetUp = () =>
  new ApiError(
    HttpStatus.SERVICE_UNAVAILABLE,
    "storage_not_configured",
    "File storage is not set up for this deployment, so files cannot be uploaded yet.",
  );
const storageDown = () =>
  new ApiError(
    HttpStatus.SERVICE_UNAVAILABLE,
    "storage_unavailable",
    "File storage is not answering. Try again in a moment.",
  );

export function toView(row: UploadRow, uploaderName: string | null): UploadView {
  return {
    id: row.id,
    filename: row.filename,
    declaredType: row.declaredType,
    detectedType: row.detectedType,
    byteSize: row.byteSize,
    sha256: row.sha256,
    status: row.status,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    scanner: row.scanner,
    scannedAt: row.scannedAt?.toISOString() ?? null,
    uploadedBy: { userId: row.uploadedByUserId, name: uploaderName },
    jobId: row.jobId,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface IncomingUpload {
  readonly filename: string | undefined;
  readonly declaredType: string | undefined;
  readonly contentLength: number | null;
  readonly body: unknown;
}

const isStream = (v: unknown): v is AsyncIterable<Uint8Array> =>
  typeof v === "object" && v !== null && Symbol.asyncIterator in v;

@Injectable()
export class UploadsService {
  constructor(
    @Inject(APP_DB) private readonly db: Db | null,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  private get database(): Db {
    if (!this.db) throw new Error("UploadsService used without a database");
    return this.db;
  }

  /**
   * Validate, store in quarantine, record and enqueue the scan. Everything a
   * person can get wrong (type, name, size, contents that do not match the
   * type) is refused here with a visible reason, before anything is stored.
   */
  async create(
    p: Principal,
    t: TenantContext,
    input: IncomingUpload,
    correlationId: string,
  ): Promise<UploadView> {
    const store = this.storage.store;
    if (!store) throw storageNotSetUp();
    let filename: string;
    let declared;
    let bytes: Buffer;
    try {
      let raw = input.filename ?? "";
      try {
        raw = decodeURIComponent(raw);
      } catch {
        throw new UploadRefused("invalid_filename", "The file name could not be read.");
      }
      filename = sanitizeFilename(raw);
      declared = checkDeclared({
        declaredType: input.declaredType ?? "",
        filename,
        contentLength: input.contentLength,
        maxBytes: this.storage.maxUploadBytes,
      });
      if (!isStream(input.body)) {
        throw new UploadRefused(
          "empty",
          "Send the file as the request body (application/octet-stream).",
        );
      }
      bytes = await readLimited(input.body, this.storage.maxUploadBytes);
      if (bytes.length === 0) throw new UploadRefused("empty", "The file is empty.");
      const detected = sniffType(bytes.subarray(0, SNIFF_BYTES), declared, {
        truncated: bytes.length > SNIFF_BYTES,
      });
      if (detected !== declared) {
        throw new UploadRefused(
          "type_mismatch",
          `The file's contents are not a ${ACCEPTED_MEDIA_TYPES[declared].label}, although its name and type say so.`,
        );
      }
    } catch (error) {
      if (error instanceof UploadRefused) throw refusal(error);
      throw error;
    }

    const id = newUploadId();
    const key = uploadKey(t.tenantId, id);
    try {
      await store.put("quarantine", key, bytes, declared);
    } catch (error) {
      if (error instanceof StorageUnavailable) throw storageDown();
      throw error;
    }
    const row = await withScope(
      this.database,
      { userId: p.userId, tenantId: t.tenantId },
      async (tx) => {
        const job = await enqueueJob(tx, {
          tenantId: t.tenantId,
          type: SCAN_UPLOAD_JOB,
          payload: { uploadId: id },
          subjectRef: id,
          idempotencyKey: id,
          createdByUserId: p.userId,
          correlationId,
        });
        const values = {
          id,
          tenantId: t.tenantId,
          uploadedByUserId: p.userId,
          filename,
          declaredType: declared,
          byteSize: bytes.length,
          sha256: sha256Hex(bytes),
          quarantineKey: key,
          jobId: job.id,
        };
        await tx.insert(uploads).values(values);
        await recordAudit(tx, {
          tenantId: t.tenantId,
          actorUserId: p.userId,
          action: "file.uploaded",
          targetType: "upload",
          targetId: id,
          metadata: { mediaType: declared, byteSize: bytes.length },
          correlationId,
        });
        const [inserted] = await tx.select().from(uploads).where(eq(uploads.id, id));
        return inserted!;
      },
    );
    return toView(row, p.name);
  }

  async list(p: Principal, t: TenantContext): Promise<UploadView[]> {
    const rows = await withScope(this.database, { userId: p.userId, tenantId: t.tenantId }, (tx) =>
      tx
        .select({ upload: uploads, name: users.name })
        .from(uploads)
        .leftJoin(users, eq(users.id, uploads.uploadedByUserId))
        .where(eq(uploads.tenantId, t.tenantId))
        .orderBy(desc(uploads.createdAt))
        .limit(100),
    );
    return rows.map((r) => toView(r.upload, r.name));
  }

  private async load(p: Principal, t: TenantContext, id: string) {
    const [row] = await withScope(this.database, { userId: p.userId, tenantId: t.tenantId }, (tx) =>
      tx
        .select({ upload: uploads, name: users.name })
        .from(uploads)
        .leftJoin(users, eq(users.id, uploads.uploadedByUserId))
        .where(eq(uploads.id, id)),
    );
    // Row-level security returns nothing for other organizations: same 404 as a missing id.
    if (!row || row.upload.tenantId !== t.tenantId)
      throw notFound("No such file in this organization.");
    return row;
  }

  async get(p: Principal, t: TenantContext, id: string): Promise<UploadView> {
    const row = await this.load(p, t, id);
    return toView(row.upload, row.name);
  }

  private requireClean(row: UploadRow) {
    if (row.status === "clean" && row.cleanKey && row.detectedType) {
      return { key: row.cleanKey, type: row.detectedType };
    }
    const why: Record<string, string> = {
      quarantined: "This file is still being checked. It can be downloaded once the scan passes.",
      scan_unavailable: "This file has not been scanned yet, so it stays in quarantine.",
      rejected: "This file was rejected and stays in quarantine. It cannot be downloaded.",
    };
    throw conflict("file_not_available", why[row.status] ?? "This file cannot be downloaded.");
  }

  /** A signed URL valid for one minute, for clean files only. */
  async download(p: Principal, t: TenantContext, id: string, correlationId: string) {
    const store = this.storage.store;
    if (!store) throw storageNotSetUp();
    const { upload } = await this.load(p, t, id);
    const clean = this.requireClean(upload);
    let signed;
    try {
      signed = await store.signedDownloadUrl("files", clean.key, {
        filename: upload.filename,
        contentType: clean.type,
        expiresInSeconds: 60,
      });
    } catch (error) {
      if (error instanceof StorageUnavailable) throw storageDown();
      throw error;
    }
    await withScope(this.database, { userId: p.userId, tenantId: t.tenantId }, (tx) =>
      recordAudit(tx, {
        tenantId: t.tenantId,
        actorUserId: p.userId,
        action: "file.download_link_issued",
        targetType: "upload",
        targetId: id,
        correlationId,
      }),
    );
    return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
  }

  /**
   * Safe previews: text is returned as text (the web app renders it escaped),
   * images as a one-minute inline URL served with their sniffed type, PDFs not
   * at all (rendering untrusted PDFs needs a sandboxed renderer; see ADR-026).
   */
  async preview(p: Principal, t: TenantContext, id: string) {
    const store = this.storage.store;
    if (!store) throw storageNotSetUp();
    const { upload } = await this.load(p, t, id);
    const clean = this.requireClean(upload);
    const kind =
      ACCEPTED_MEDIA_TYPES[clean.type as keyof typeof ACCEPTED_MEDIA_TYPES]?.preview ?? "none";
    try {
      if (kind === "text") {
        const bytes = await store.getBytes("files", clean.key, this.storage.maxUploadBytes);
        const limit = 20_000;
        const text = new TextDecoder("utf-8").decode(bytes.subarray(0, limit));
        return { kind: "text" as const, text, truncated: bytes.length > limit };
      }
      if (kind === "image") {
        const signed = await store.signedDownloadUrl("files", clean.key, {
          filename: upload.filename,
          contentType: clean.type,
          inline: true,
          expiresInSeconds: 60,
        });
        return {
          kind: "image" as const,
          url: signed.url,
          expiresAt: signed.expiresAt.toISOString(),
        };
      }
    } catch (error) {
      if (error instanceof StorageUnavailable) throw storageDown();
      throw error;
    }
    return { kind: "none" as const };
  }
}
