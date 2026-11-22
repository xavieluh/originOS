import { envFields, parseEnv, type EnvSource } from "@originos/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: envFields.nodeEnv,
  LOG_LEVEL: envFields.logLevel,
  MCP_PORT: envFields.port(4100),
  MCP_HOST: envFields.host,
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: EnvSource = process.env): Env {
  return parseEnv("mcp-server", EnvSchema, source);
}
