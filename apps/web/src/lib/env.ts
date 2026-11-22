import "server-only";
import { envFields, parseEnv, type EnvSource } from "@originos/config";
import { z } from "zod";

const WebServerEnvSchema = z.object({
  NODE_ENV: envFields.nodeEnv,
  /** Base URL of apps/api, used only from server code. Never sent to the browser. */
  ORIGINOS_API_URL: envFields.url.default("http://127.0.0.1:4000"),
  /** Opt-in for the /design-system gallery in production builds. Only the exact string "true" enables it. */
  ORIGINOS_ENABLE_GALLERY: z.enum(["true", "false"]).default("false"),
});

export type WebServerEnv = z.infer<typeof WebServerEnvSchema>;

export function loadWebServerEnv(source: EnvSource = process.env): WebServerEnv {
  return parseEnv("web", WebServerEnvSchema, source);
}

/** The component gallery is a development tool: on outside production, off in production unless opted in. */
export function isGalleryEnabled(
  env: Pick<WebServerEnv, "NODE_ENV" | "ORIGINOS_ENABLE_GALLERY">,
): boolean {
  return env.NODE_ENV !== "production" || env.ORIGINOS_ENABLE_GALLERY === "true";
}
