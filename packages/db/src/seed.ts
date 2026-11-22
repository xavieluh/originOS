import type { Database } from "./client.js";

/**
 * Prefix every human-readable field of seeded rows with this label, so sample
 * data can never be mistaken for real records in the UI, exports or logs.
 */
export const SAMPLE_DATA_LABEL = "[SAMPLE]";

export interface SeedSet {
  readonly name: string;
  readonly description: string;
  run(database: Database): Promise<void>;
}

/**
 * Registered seed sets. Empty until Phase 06 creates the first tables; each
 * later phase that needs demo data adds one here with labeled rows only.
 */
export const seedSets: readonly SeedSet[] = [];

export class SeedRefusedError extends Error {
  constructor(reason: string) {
    super(`Refusing to seed: ${reason}`);
    this.name = "SeedRefusedError";
  }
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Seeding is allowed only outside production and, by default, only against a
 * database on this machine. `allowNonLocal` exists for disposable CI or
 * staging databases and must be set explicitly.
 */
export function assertSeedAllowed(options: {
  readonly nodeEnv: string;
  readonly databaseUrl: string;
  readonly allowNonLocal?: boolean;
}): void {
  if (options.nodeEnv === "production") {
    throw new SeedRefusedError("NODE_ENV is production. Sample data never goes into production.");
  }
  let host: string;
  try {
    host = new URL(options.databaseUrl).hostname;
  } catch {
    throw new SeedRefusedError("DATABASE_URL is not a valid URL.");
  }
  if (!LOOPBACK_HOSTS.has(host) && !options.allowNonLocal) {
    throw new SeedRefusedError(
      "the database is not on this machine. Set SEED_ALLOW_NON_LOCAL=true for a disposable database.",
    );
  }
}
