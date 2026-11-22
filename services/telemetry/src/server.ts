import { createHttpService } from "@originos/service-kit";
import type { FastifyInstance } from "fastify";
import type { Env } from "./env.js";

export const VERSION = process.env.ORIGINOS_VERSION ?? "0.0.0-dev";

/**
 * Phase 01 scaffold. Authenticated OTLP-compatible ingest, redaction, dedupe and
 * the partitioned telemetry store arrive in Phase 16 (ADR-008). Until then this
 * process serves health only and accepts no events.
 */
export function buildServer(env: Pick<Env, "LOG_LEVEL">): FastifyInstance {
  return createHttpService({ service: "telemetry", version: VERSION, logLevel: env.LOG_LEVEL });
}
