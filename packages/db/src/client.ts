import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

/** Non-superuser role created by migration 0001; row-level security applies to it. */
export const APPLICATION_ROLE = "originos_app";

export interface DatabaseOptions {
  /** postgres:// connection string. Treated as a secret: never logged. */
  readonly url: string;
  readonly maxConnections?: number;
  readonly connectTimeoutMs?: number;
  /**
   * Switch every pooled connection to this role (`SET ROLE`) before use, so
   * row-level security is enforced. Services pass APPLICATION_ROLE; migrations
   * and test fixtures connect without it.
   */
  readonly role?: string;
}

export type Db = NodePgDatabase<typeof schema>;

export interface Database {
  readonly db: Db;
  readonly pool: pg.Pool;
  close(): Promise<void>;
}

export function createDatabase(options: DatabaseOptions): Database {
  const pool = new pg.Pool({
    connectionString: options.url,
    max: options.maxConnections ?? 10,
    connectionTimeoutMillis: options.connectTimeoutMs ?? 2_000,
  });
  // Without a listener, an idle-client error would crash the process.
  // The error object from pg does not include the password.
  pool.on("error", () => undefined);
  if (options.role) {
    const statement = `SET ROLE ${pg.escapeIdentifier(options.role)}`;
    // Queued on the new client before the pool hands it to any caller.
    pool.on("connect", (client) => {
      client.query(statement).catch(() => undefined);
    });
  }
  return {
    db: drizzle({ client: pool, schema }),
    pool,
    close: () => pool.end(),
  };
}

export type PingResult =
  | { readonly ok: true; readonly latencyMs: number }
  | { readonly ok: false; readonly reason: "unreachable" | "error"; readonly latencyMs: number };

/**
 * Round-trip `select 1`. Returns a classification only; the underlying error
 * is not returned because pg error messages can echo host and user names.
 */
export async function pingDatabase(
  pool: Pick<pg.Pool, "query">,
  now: () => number = () => performance.now(),
): Promise<PingResult> {
  const started = now();
  try {
    await pool.query("select 1");
    return { ok: true, latencyMs: Math.round(now() - started) };
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    const unreachable =
      typeof code === "string" &&
      ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EHOSTUNREACH", "ECONNRESET"].includes(code);
    const timedOut = error instanceof Error && /timeout/i.test(error.message);
    return {
      ok: false,
      reason: unreachable || timedOut ? "unreachable" : "error",
      latencyMs: Math.round(now() - started),
    };
  }
}
