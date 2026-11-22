import { envFields, parseEnv, type EnvSource } from "@originos/config";
import { z } from "zod";

const ApiEnvSchema = z
  .object({
    NODE_ENV: envFields.nodeEnv,
    LOG_LEVEL: envFields.logLevel,
    API_PORT: envFields.port(4000),
    API_HOST: envFields.host,
    /** Optional in development and test so the API can start before Postgres exists. */
    DATABASE_URL: envFields.url.optional(),
  })
  .refine((env) => env.NODE_ENV !== "production" || env.DATABASE_URL !== undefined, {
    path: ["DATABASE_URL"],
    message: "is required when NODE_ENV=production",
  });

export type ApiEnv = z.infer<typeof ApiEnvSchema>;

export function loadApiEnv(source: EnvSource = process.env): ApiEnv {
  return parseEnv("api", ApiEnvSchema, source);
}
