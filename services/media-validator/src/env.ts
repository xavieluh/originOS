import { envFields, parseEnv, type EnvSource } from "@originos/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: envFields.nodeEnv,
  LOG_LEVEL: envFields.logLevel,
  MEDIA_VALIDATOR_PORT: envFields.port(4300),
  MEDIA_VALIDATOR_HOST: envFields.host,
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: EnvSource = process.env): Env {
  return parseEnv("media-validator", EnvSchema, source);
}
