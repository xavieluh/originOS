// Is this database ready for the services? Used by `pnpm db:status` and by
// scripts/dev.sh, so a fresh or stale local database fails with a clear fix
// instead of "role originos_app does not exist" on the first sign-up.
import { sql } from "drizzle-orm";
import { APPLICATION_ROLE, type Database, WORKER_ROLE } from "./client.js";
import { MIGRATIONS_FOLDER } from "./migrate.js";
import { readJournal } from "./rollback.js";

export interface DatabaseStatus {
  /** Migrations in the repository that this database has not applied yet, oldest first. */
  readonly pending: string[];
  /** Roles the services switch to (created by migrations) that do not exist. */
  readonly missingRoles: string[];
  /** Applied migrations this checkout does not know (the database is newer than the code). */
  readonly unknownApplied: number;
}

export async function databaseStatus(
  database: Database,
  folder = MIGRATIONS_FOLDER,
): Promise<DatabaseStatus> {
  const journal = readJournal(folder);
  const known = new Set(journal.map((e) => e.when));
  const exists = await database.db.execute<{ ok: boolean }>(
    sql`select to_regclass('drizzle.__drizzle_migrations') is not null as ok`,
  );
  let appliedWhen: number[] = [];
  if (exists.rows[0]?.ok) {
    const rows = await database.db.execute<{ created_at: string }>(
      sql`select created_at from drizzle.__drizzle_migrations`,
    );
    appliedWhen = rows.rows.map((r) => Number(r.created_at));
  }
  const applied = new Set(appliedWhen);
  const pending = journal.filter((e) => !applied.has(e.when)).map((e) => e.tag);
  const unknownApplied = appliedWhen.filter((w) => !known.has(w)).length;

  const expected = [APPLICATION_ROLE, WORKER_ROLE];
  const roles = await database.db.execute<{ rolname: string }>(
    sql`select rolname from pg_roles where rolname in (${sql.join(
      expected.map((r) => sql`${r}`),
      sql`, `,
    )})`,
  );
  const present = new Set(roles.rows.map((r) => r.rolname));
  const missingRoles = expected.filter((r) => !present.has(r));
  return { pending, missingRoles, unknownApplied };
}

/** True when the services can run against this database. */
export const isReady = (s: DatabaseStatus) => s.pending.length === 0 && s.missingRoles.length === 0;
