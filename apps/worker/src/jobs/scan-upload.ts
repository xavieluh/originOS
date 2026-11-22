// ingest.scan_upload (Phase 07): confirm an uploaded file's type and hash,
// scan it for malware, and release it to the files bucket, or keep it in
// quarantine with a visible reason. Enqueued by the API with each upload.
import { ACCEPTED_MEDIA_TYPES, type UploadErrorCode } from "@originos/contracts";
import { enqueueEvent, schema } from "@originos/db";
import {
  type MalwareScanner,
  type ObjectStore,
  SNIFF_BYTES,
  ScannerUnavailable,
  StorageUnavailable,
  isAccepted,
  sha256Hex,
  sniffType,
} from "@originos/storage";
import { eq } from "drizzle-orm";
import { type JobHandler, PermanentJobError } from "../job-runner.js";

export const SCAN_UPLOAD_JOB = "ingest.scan_upload";

export interface ScanUploadDeps {
  /** Null when object storage is not configured. */
  readonly store: ObjectStore | null;
  /** Null when no scanner is configured: files stay quarantined. */
  readonly scanner: MalwareScanner | null;
  readonly maxUploadBytes: number;
}

const { uploads } = schema;

export function scanUploadHandler(deps: ScanUploadDeps): JobHandler {
  return {
    type: SCAN_UPLOAD_JOB,
    async run(ctx) {
      const uploadId = String(ctx.job.payload.uploadId ?? "");
      const [upload] = await ctx.db.select().from(uploads).where(eq(uploads.id, uploadId));
      if (!upload || upload.tenantId !== ctx.job.tenantId) {
        throw new PermanentJobError("The upload this job refers to does not exist.");
      }
      if (upload.status === "clean" || upload.status === "rejected") {
        return { uploadId, status: upload.status, alreadyDone: true };
      }

      const markUnavailable = async (code: UploadErrorCode, message: string) => {
        await ctx.db
          .update(uploads)
          .set({ status: "scan_unavailable", errorCode: code, errorMessage: message })
          .where(eq(uploads.id, uploadId));
      };
      // Reject: keep the bytes in quarantine, record why, and tell other modules once.
      const reject = (code: UploadErrorCode, message: string, signature?: string) =>
        ctx.step("reject", async (tx) => {
          await tx
            .update(uploads)
            .set({
              status: "rejected",
              errorCode: code,
              errorMessage: message,
              ...(signature ? { scanner: deps.scanner?.name ?? null, scannedAt: new Date() } : {}),
            })
            .where(eq(uploads.id, uploadId));
          await enqueueEvent(tx, {
            tenantId: upload.tenantId,
            type: "upload.rejected",
            subjectRef: uploadId,
            payload: { uploadId, code },
            correlationId: ctx.job.correlationId,
            causationId: ctx.job.id,
          });
          return { status: "rejected", code };
        });

      if (!deps.store) {
        await markUnavailable("storage_unavailable", "File storage is not set up.");
        throw new PermanentJobError("Object storage is not configured.");
      }
      await ctx.progress(10, "Reading the file from quarantine");
      let bytes: Uint8Array;
      try {
        bytes = await deps.store.getBytes("quarantine", upload.quarantineKey, deps.maxUploadBytes);
      } catch (error) {
        if (error instanceof StorageUnavailable) throw error; // retry with backoff
        throw new PermanentJobError("The quarantined file is missing.");
      }

      await ctx.progress(30, "Checking the file type");
      if (sha256Hex(bytes) !== upload.sha256) {
        throw new PermanentJobError("The stored bytes do not match the hash recorded at upload.");
      }
      const detected = sniffType(bytes.subarray(0, SNIFF_BYTES), upload.declaredType, {
        truncated: bytes.length > SNIFF_BYTES,
      });
      if (!detected || detected !== upload.declaredType || !isAccepted(detected)) {
        return reject("type_mismatch", "The file's contents do not match its declared type.");
      }

      await ctx.progress(50, "Scanning for malware");
      if (!deps.scanner) {
        await markUnavailable(
          "scanner_unavailable",
          "Malware scanning is not set up, so the file stays in quarantine.",
        );
        throw new PermanentJobError("No malware scanner is configured.");
      }
      let verdict;
      try {
        verdict = await deps.scanner.scan(bytes);
      } catch (error) {
        if (error instanceof ScannerUnavailable) {
          await markUnavailable(
            "scanner_unavailable",
            "The malware scanner is not answering; the file stays in quarantine and will be retried.",
          );
        }
        throw error;
      }
      if (verdict.verdict === "infected") {
        return reject(
          "malware_detected",
          `The malware scanner flagged this file (${verdict.signature}). It stays in quarantine and cannot be downloaded.`,
          verdict.signature,
        );
      }

      await ctx.progress(80, "Releasing the clean file");
      await deps.store.copy("quarantine", "files", upload.quarantineKey); // idempotent
      const released = await ctx.step("release", async (tx) => {
        await tx
          .update(uploads)
          .set({
            status: "clean",
            detectedType: detected,
            cleanKey: upload.quarantineKey,
            scanner: deps.scanner!.name,
            scannedAt: new Date(),
            errorCode: null,
            errorMessage: null,
          })
          .where(eq(uploads.id, uploadId));
        await enqueueEvent(tx, {
          tenantId: upload.tenantId,
          type: "upload.cleaned",
          subjectRef: uploadId,
          payload: { uploadId, mediaType: detected, label: ACCEPTED_MEDIA_TYPES[detected].label },
          correlationId: ctx.job.correlationId,
          causationId: ctx.job.id,
        });
        return { status: "clean" };
      });
      return { uploadId, ...released };
    },
  };
}
