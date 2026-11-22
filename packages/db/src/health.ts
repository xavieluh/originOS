import type { DependencyCheck } from "@originos/contracts";
import { type Database, pingDatabase } from "./client.js";

/** Readiness check shared by the API and the worker. `null` = DATABASE_URL not configured. */
export async function databaseHealthCheck(database: Database | null): Promise<DependencyCheck> {
  if (!database) return { status: "not_configured", detail: "DATABASE_URL is not set" };
  const result = await pingDatabase(database.pool);
  return result.ok
    ? { status: "ok", latencyMs: result.latencyMs }
    : { status: result.reason, latencyMs: result.latencyMs };
}
