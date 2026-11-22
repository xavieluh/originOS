import { envFields, parseEnv, type EnvSource } from "@originos/config";
import { z } from "zod";

const WorkerEnvSchema = z
  .object({
    NODE_ENV: envFields.nodeEnv,
    LOG_LEVEL: envFields.logLevel,
    /** Health endpoint only; the worker serves no other HTTP traffic. */
    WORKER_HEALTH_PORT: envFields.port(4050),
    WORKER_HEALTH_HOST: envFields.host,
    DATABASE_URL: envFields.url.optional(),
    OUTBOX_POLL_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
    JOB_POLL_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
  })
  .refine((env) => env.NODE_ENV !== "production" || env.DATABASE_URL !== undefined, {
    path: ["DATABASE_URL"],
    message: "is required when NODE_ENV=production",
  });

export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

export function loadWorkerEnv(source: EnvSource = process.env): WorkerEnv {
  return parseEnv("worker", WorkerEnvSchema, source);
}
