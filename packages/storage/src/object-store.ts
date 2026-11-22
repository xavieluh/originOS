// S3-compatible object storage (ADR-026). Two buckets: quarantine (everything
// as received) and files (clean copies only). Keys are derived from the tenant
// and the upload id, never from client input. Downloads are short-lived signed
// URLs for clean objects only, issued after the API's permission check.
import {
  CopyObjectCommand,
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface StorageConfig {
  /** S3 API endpoint the services use. */
  readonly endpoint: string;
  /** Endpoint browsers reach for signed URLs, when it differs (e.g. behind a proxy). */
  readonly publicEndpoint?: string;
  readonly region: string;
  /** Secret: never logged. */
  readonly accessKeyId: string;
  /** Secret: never logged. */
  readonly secretAccessKey: string;
  readonly quarantineBucket: string;
  readonly filesBucket: string;
}

export type Bucket = "quarantine" | "files";

export class StorageUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageUnavailable";
  }
}

export interface SignedUrl {
  readonly url: string;
  readonly expiresAt: Date;
}

export interface ObjectStore {
  put(bucket: Bucket, key: string, body: Uint8Array, contentType: string): Promise<void>;
  getBytes(bucket: Bucket, key: string, maxBytes: number): Promise<Uint8Array>;
  /** Server-side copy; idempotent. */
  copy(from: Bucket, to: Bucket, key: string): Promise<void>;
  exists(bucket: Bucket, key: string): Promise<boolean>;
  signedDownloadUrl(
    bucket: Bucket,
    key: string,
    options: {
      readonly filename: string;
      readonly contentType: string;
      readonly inline?: boolean;
      readonly expiresInSeconds?: number;
    },
  ): Promise<SignedUrl>;
  /** Create both buckets if missing (local development and tests). */
  ensureBuckets(): Promise<void>;
  ping(): Promise<boolean>;
}

/** The only way keys are built: tenant and upload id, both validated. */
export function uploadKey(tenantId: string, uploadId: string): string {
  if (!/^[0-9a-f-]{36}$/.test(tenantId) || !/^upl_[0-9a-hjkmnp-tv-z]{26}$/.test(uploadId)) {
    throw new Error("Invalid storage key parts.");
  }
  return `tenants/${tenantId}/uploads/${uploadId}`;
}

/** RFC 6266 / 5987 Content-Disposition with an ASCII fallback. */
export function contentDisposition(filename: string, inline = false): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${inline ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function client(config: StorageConfig, endpoint: string) {
  return new S3Client({
    endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // Only send/validate checksums when an operation requires them: S3-compatible
    // servers differ in which of the newer default checksums they support.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    maxAttempts: 3,
  });
}

/** Map SDK and network failures to one error without endpoint or credential details. */
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof StorageUnavailable) throw error;
    if (error instanceof S3ServiceException && error.name === "NoSuchKey") throw error;
    throw new StorageUnavailable("Object storage is not available.");
  }
}

export function createS3ObjectStore(config: StorageConfig): ObjectStore {
  const s3 = client(config, config.endpoint);
  const signer = config.publicEndpoint ? client(config, config.publicEndpoint) : s3;
  const bucketName = (b: Bucket) =>
    b === "quarantine" ? config.quarantineBucket : config.filesBucket;

  return {
    put: (bucket, key, body, contentType) =>
      guarded(async () => {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucketName(bucket),
            Key: key,
            Body: body,
            ContentType: contentType,
            ContentLength: body.length,
          }),
        );
      }),
    getBytes: (bucket, key, maxBytes) =>
      guarded(async () => {
        const out = await s3.send(new GetObjectCommand({ Bucket: bucketName(bucket), Key: key }));
        if ((out.ContentLength ?? 0) > maxBytes)
          throw new StorageUnavailable("Stored object is larger than allowed.");
        const bytes = await out.Body!.transformToByteArray();
        if (bytes.length > maxBytes)
          throw new StorageUnavailable("Stored object is larger than allowed.");
        return bytes;
      }),
    copy: (from, to, key) =>
      guarded(async () => {
        await s3.send(
          new CopyObjectCommand({
            Bucket: bucketName(to),
            Key: key,
            CopySource: `${bucketName(from)}/${key}`,
          }),
        );
      }),
    exists: (bucket, key) =>
      guarded(async () => {
        try {
          await s3.send(new HeadObjectCommand({ Bucket: bucketName(bucket), Key: key }));
          return true;
        } catch (error) {
          if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404)
            return false;
          throw error;
        }
      }),
    signedDownloadUrl: (bucket, key, options) =>
      guarded(async () => {
        const expiresIn = Math.min(options.expiresInSeconds ?? 60, 300);
        const url = await getSignedUrl(
          signer,
          new GetObjectCommand({
            Bucket: bucketName(bucket),
            Key: key,
            ResponseContentDisposition: contentDisposition(options.filename, options.inline),
            ResponseContentType: options.contentType,
          }),
          { expiresIn },
        );
        return { url, expiresAt: new Date(Date.now() + expiresIn * 1000) };
      }),
    ensureBuckets: () =>
      guarded(async () => {
        for (const bucket of [config.quarantineBucket, config.filesBucket]) {
          try {
            await s3.send(new HeadBucketCommand({ Bucket: bucket }));
          } catch {
            await s3.send(new CreateBucketCommand({ Bucket: bucket }));
          }
        }
      }),
    async ping() {
      try {
        await s3.send(new HeadBucketCommand({ Bucket: config.quarantineBucket }));
        return true;
      } catch {
        return false;
      }
    },
  };
}
