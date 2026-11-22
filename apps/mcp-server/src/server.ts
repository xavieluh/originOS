import { createHttpService } from "@originos/service-kit";
import type { FastifyInstance } from "fastify";
import type { Env } from "./env.js";

export const VERSION = process.env.ORIGINOS_VERSION ?? "0.0.0-dev";

/**
 * Phase 01 scaffold. The MCP transport, OAuth for MCP clients and tool schemas
 * arrive in Phase 23 (ADR-007). Until then this process serves health only;
 * there is no /mcp endpoint, so no client can mistake it for a working connector.
 * Boundary: this app never imports @originos/db (lint-enforced); it reaches data
 * only through the API with a user-delegated token.
 */
export function buildServer(env: Pick<Env, "LOG_LEVEL">): FastifyInstance {
  return createHttpService({ service: "mcp-server", version: VERSION, logLevel: env.LOG_LEVEL });
}
