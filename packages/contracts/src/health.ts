import { z } from "zod";

/** Every OriginOS process that exposes a health endpoint. */
export const ServiceName = z.enum([
  "web",
  "api",
  "worker",
  "mcp-server",
  "telemetry",
  "media-validator",
  "ai-worker",
]);
export type ServiceName = z.infer<typeof ServiceName>;

/**
 * State of one dependency.
 * - `ok`: checked just now and working.
 * - `not_configured`: the dependency is optional here and no configuration was given.
 * - `unreachable`: configured, but the check could not reach it.
 * - `error`: reached, but it answered with an error.
 */
export const DependencyStatus = z.enum(["ok", "not_configured", "unreachable", "error"]);
export type DependencyStatus = z.infer<typeof DependencyStatus>;

export const DependencyCheck = z.object({
  status: DependencyStatus,
  /** Human-readable, non-sensitive explanation. Never contains credentials or connection strings. */
  detail: z.string().max(200).optional(),
  latencyMs: z.number().nonnegative().optional(),
});
export type DependencyCheck = z.infer<typeof DependencyCheck>;

export const HealthStatus = z.enum(["ok", "degraded", "down"]);
export type HealthStatus = z.infer<typeof HealthStatus>;

/** Response body of `GET /health/live` and `GET /health/ready` on every service. */
export const HealthResponse = z.object({
  service: ServiceName,
  status: HealthStatus,
  version: z.string().min(1),
  checkedAt: z.iso.datetime(),
  checks: z.record(z.string(), DependencyCheck),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

/**
 * Overall status from dependency checks: any `unreachable`/`error` makes the
 * service `down` for readiness; `not_configured` is reported but does not fail.
 */
export function summarizeChecks(checks: Readonly<Record<string, DependencyCheck>>): HealthStatus {
  const statuses = Object.values(checks).map((c) => c.status);
  if (statuses.some((s) => s === "unreachable" || s === "error")) return "down";
  return "ok";
}
