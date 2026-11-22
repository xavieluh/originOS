import "server-only";
import { envFields, parseEnv, type EnvSource } from "@originos/config";
import { z } from "zod";

const WebServerEnvSchema = z.object({
  NODE_ENV: envFields.nodeEnv,
  /** Base URL of apps/api, used only from server code. Never sent to the browser. */
  ORIGINOS_API_URL: envFields.url.default("http://127.0.0.1:4000"),
});

export type WebServerEnv = z.infer<typeof WebServerEnvSchema>;

export function loadWebServerEnv(source: EnvSource = process.env): WebServerEnv {
  return parseEnv("web", WebServerEnvSchema, source);
}
