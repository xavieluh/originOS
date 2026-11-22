import type { HealthResponse } from "@originos/contracts";

export const WEB_VERSION = process.env.ORIGINOS_VERSION ?? "0.0.0-dev";

/** Liveness of the web process itself. It does not call the API. */
export function webLiveness(now: Date = new Date()): HealthResponse {
  return {
    service: "web",
    status: "ok",
    version: WEB_VERSION,
    checkedAt: now.toISOString(),
    checks: {},
  };
}
