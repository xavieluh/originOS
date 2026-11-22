import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { MIGRATIONS_FOLDER } from "./migrate.js";

interface JournalEntry {
  readonly idx: number;
  readonly when: number;
  readonly tag: string;
}

export function readJournal(folder = MIGRATIONS_FOLDER): JournalEntry[] {
  const journal = JSON.parse(readFileSync(path.join(folder, "meta", "_journal.json"), "utf8")) as {
    entries: JournalEntry[];
  };
  return journal.entries;
}

/** Statements of a down migration, split on drizzle's breakpoint marker like the up files. */
export function downStatements(tag: string, folder = MIGRATIONS_FOLDER): string[] {
  const file = path.join(folder, "down", `${tag}.sql`);
  return readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.replace(/--.*$/gm, "").trim().length > 0);
}

/** Tags of applied migrations, newest first. */
export async function appliedMigrations(database: Database, folder = MIGRATIONS_FOLDER) {
  const byWhen = new Map(readJournal(folder).map((e) => [e.when, e.tag]));
  const exists = await database.db.execute<{ ok: boolean }>(
    sql`select to_regclass('drizzle.__drizzle_migrations') is not null as ok`,
  );
  if (!exists.rows[0]?.ok) return [];
  const rows = await database.db.execute<{ created_at: string }>(
    sql`select created_at from drizzle.__drizzle_migrations order by created_at desc`,
  );
  return rows.rows.map((r) => {
    const tag = byWhen.get(Number(r.created_at));
    if (!tag) throw new Error(`Applied migration ${r.created_at} is not in the journal.`);
    return { tag, when: Number(r.created_at) };
  });
}

/**
 * Undo the newest `steps` applied migrations, each in its own transaction,
 * using migrations/down/<tag>.sql. Destroys the data those migrations hold:
 * development and test only (the CLI refuses production). Must run as the
 * schema owner.
 */
export async function rollbackMigrations(
  database: Database,
  steps = 1,
  folder = MIGRATIONS_FOLDER,
): Promise<string[]> {
  const applied = (await appliedMigrations(database, folder)).slice(0, steps);
  const undone: string[] = [];
  for (const { tag, when } of applied) {
    const statements = downStatements(tag, folder);
    await database.db.transaction(async (tx) => {
      for (const statement of statements) await tx.execute(sql.raw(statement));
      await tx.execute(sql`delete from drizzle.__drizzle_migrations where created_at = ${when}`);
    });
    undone.push(tag);
  }
  return undone;
}
