// Storage and scanner settings shared by the API and the worker.
import { parseEnv, envFields, type EnvSource } from "@originos/config";
import { MAX_UPLOAD_BYTES } from "@originos/contracts";
import { z } from "zod";
import { createS3ObjectStore, type ObjectStore, type StorageConfig } from "./object-store.js";
import { createClamdScanner, type MalwareScanner } from "./scanner.js";

const StorageEnv = z
  .object({
    NODE_ENV: envFields.nodeEnv,
    S3_ENDPOINT: envFields.url.optional(),
    S3_PUBLIC_ENDPOINT: envFields.url.optional(),
    S3_REGION: z.string().min(1).default("us-east-1"),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    S3_BUCKET_QUARANTINE: z
      .string()
      .regex(/^[a-z0-9][a-z0-9.-]{2,62}$/)
      .default("originos-quarantine"),
    S3_BUCKET_FILES: z
      .string()
      .regex(/^[a-z0-9][a-z0-9.-]{2,62}$/)
      .default("originos-files"),
    UPLOAD_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_UPLOAD_BYTES)
      .default(MAX_UPLOAD_BYTES),
    CLAMAV_HOST: z.string().min(1).optional(),
    CLAMAV_PORT: envFields.port(3310),
  })
  .refine((e) => (e.S3_ENDPOINT === undefined) === (e.S3_ACCESS_KEY_ID === undefined), {
    path: ["S3_ACCESS_KEY_ID"],
    message: "S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are set together",
  })
  .refine((e) => (e.S3_ACCESS_KEY_ID === undefined) === (e.S3_SECRET_ACCESS_KEY === undefined), {
    path: ["S3_SECRET_ACCESS_KEY"],
    message: "S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are set together",
  })
  .refine((e) => e.NODE_ENV !== "production" || e.S3_ENDPOINT?.startsWith("https://"), {
    path: ["S3_ENDPOINT"],
    message: "must be an https URL when NODE_ENV=production",
  });

export interface Storage {
  /** Null when object storage is not configured: uploads then answer "not set up". */
  readonly store: ObjectStore | null;
  /** Null when no scanner is configured: uploads stay quarantined. */
  readonly scanner: MalwareScanner | null;
  readonly maxUploadBytes: number;
}

export function storageConfigFromEnv(source: EnvSource = process.env): {
  config: StorageConfig | null;
  clamav: { host: string; port: number } | null;
  maxUploadBytes: number;
} {
  const env = parseEnv("storage", StorageEnv, source);
  return {
    config: env.S3_ENDPOINT
      ? {
          endpoint: env.S3_ENDPOINT,
          ...(env.S3_PUBLIC_ENDPOINT ? { publicEndpoint: env.S3_PUBLIC_ENDPOINT } : {}),
          region: env.S3_REGION,
          accessKeyId: env.S3_ACCESS_KEY_ID!,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
          quarantineBucket: env.S3_BUCKET_QUARANTINE,
          filesBucket: env.S3_BUCKET_FILES,
        }
      : null,
    clamav: env.CLAMAV_HOST ? { host: env.CLAMAV_HOST, port: env.CLAMAV_PORT } : null,
    maxUploadBytes: env.UPLOAD_MAX_BYTES,
  };
}

export function storageFromEnv(source: EnvSource = process.env): Storage {
  const { config, clamav, maxUploadBytes } = storageConfigFromEnv(source);
  return {
    store: config ? createS3ObjectStore(config) : null,
    scanner: clamav ? createClamdScanner(clamav) : null,
    maxUploadBytes,
  };
}
