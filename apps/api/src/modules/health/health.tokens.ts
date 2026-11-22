import type { Database } from "@originos/db";

/**
 * Injection token for the optional database handle. `null` means DATABASE_URL
 * was not configured, which readiness reports as `not_configured`.
 *
 * Constructor parameters use explicit @Inject tokens throughout the API, so
 * dependency injection does not depend on emitted decorator metadata
 * (tsx and Vitest transpile without it). See docs/DECISIONS.md ADR-014.
 */
export const DATABASE = Symbol("DATABASE");
export type OptionalDatabase = Database | null;
