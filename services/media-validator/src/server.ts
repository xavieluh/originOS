import { createHttpService } from "@originos/service-kit";
import type { FastifyInstance } from "fastify";
import type { Env } from "./env.js";

export const VERSION = process.env.ORIGINOS_VERSION ?? "0.0.0-dev";

/**
 * Phase 01 scaffold. C2PA validation with the official CAI SDK arrives in
 * Phase 12 (ADR-005), which also decides the runtime (Rust or Node binding)
 * and enforces no network egress plus CPU/memory/time limits at deploy time.
 * Until then this process serves health only and validates nothing.
 */
export function buildServer(env: Pick<Env, "LOG_LEVEL">): FastifyInstance {
  return createHttpService({
    service: "media-validator",
    version: VERSION,
    logLevel: env.LOG_LEVEL,
  });
}
