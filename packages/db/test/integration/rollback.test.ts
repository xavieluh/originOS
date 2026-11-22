// Phase 06 acceptance: every migration applies and rolls back. Runs on a
// throwaway database created next to the test database and dropped afterwards,
// so the shared test database is never rolled back under other test files.
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Database,
  appliedMigrations,
  createDatabase,
  rollbackMigrations,
  runMigrations,
} from "../../src/index.js";
import { readJournal } from "../../src/rollback.js";

const url = process.env.TEST_DATABASE_URL;
if (!url)
  throw new Error("TEST_DATABASE_URL must be set for integration tests (see .env.example).");

const name = `originos_rollback_${randomBytes(4).toString("hex")}`;
const admin = createDatabase({ url });
let scratch: Database;

/** Everything a migration can create in the application schemas, as sorted text. */
async function fingerprint(db: Database): Promise<string[]> {
  const result = await db.db.execute<{ item: string }>(sql`
    with s as (select unnest(array['core','trust','content','evidence','agents','drizzle']) as n)
    select 'schema ' || nspname as item from pg_namespace where nspname in (select n from s)
    union all
    select 'column ' || table_schema || '.' || table_name || '.' || column_name || ' ' || data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '')
      from information_schema.columns where table_schema in (select n from s) and table_name <> '__drizzle_migrations'
    union all
    select 'constraint ' || conrelid::regclass || ' ' || conname || ' ' || pg_get_constraintdef(oid)
      from pg_constraint where connamespace in (select oid from pg_namespace where nspname in (select n from s))
    union all
    select 'index ' || schemaname || '.' || indexname || ' ' || indexdef from pg_indexes where schemaname in (select n from s)
    union all
    select 'policy ' || schemaname || '.' || tablename || ' ' || policyname || ' ' || coalesce(qual, '') || ' ' || coalesce(with_check, '')
      from pg_policies where schemaname in (select n from s)
    union all
    select 'trigger ' || tgrelid::regclass || ' ' || tgname from pg_trigger
      where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace in (select oid from pg_namespace where nspname in (select n from s)))
    union all
    select 'function ' || p.oid::regprocedure from pg_proc p where pronamespace in (select oid from pg_namespace where nspname in (select n from s))
    union all
    select 'grant ' || table_schema || '.' || table_name || ' ' || grantee || ' ' || privilege_type
      from information_schema.role_table_grants where table_schema in (select n from s) and grantee like 'originos_%'
    union all
    select 'rls ' || oid::regclass || ' ' || relrowsecurity || ' ' || relforcerowsecurity
      from pg_class where relkind = 'r' and relnamespace in (select oid from pg_namespace where nspname in (select n from s))
    order by 1`);
  return result.rows.map((r) => r.item);
}

beforeAll(async () => {
  await admin.db.execute(sql.raw(`create database ${name}`));
  const target = new URL(url);
  target.pathname = `/${name}`;
  scratch = createDatabase({ url: target.toString() });
});

afterAll(async () => {
  await scratch?.close();
  await admin.db.execute(sql.raw(`drop database if exists ${name} with (force)`));
  await admin.close();
});

describe("migrations", () => {
  it("each migration rolls back cleanly and re-applies to an identical schema", async () => {
    const journal = readJournal();
    const empty = await fingerprint(scratch);
    await runMigrations(scratch);
    const full = await fingerprint(scratch);
    expect((await appliedMigrations(scratch)).map((m) => m.tag)).toEqual(
      journal.map((e) => e.tag).reverse(),
    );

    // Down one step at a time to nothing, recording each intermediate schema.
    const states: string[][] = [full];
    for (const entry of [...journal].reverse()) {
      expect(await rollbackMigrations(scratch, 1)).toEqual([entry.tag]);
      states.push(await fingerprint(scratch));
    }
    // Every step changed the schema, and the last one left only drizzle's journal.
    for (let i = 1; i < states.length; i += 1) expect(states[i]).not.toEqual(states[i - 1]);
    const appSchemas = (items: string[] | undefined) =>
      (items ?? []).filter((i) => !i.includes("drizzle"));
    expect(appSchemas(states.at(-1))).toEqual(appSchemas(empty));
    expect(appSchemas(empty)).toEqual([]);
    expect(await appliedMigrations(scratch)).toEqual([]);

    // Up again from nothing: identical to the first time.
    await runMigrations(scratch);
    expect(await fingerprint(scratch)).toEqual(full);

    // And the newest migration alone, down and up.
    await rollbackMigrations(scratch, 1);
    expect(await fingerprint(scratch)).toEqual(states[1]);
    await runMigrations(scratch);
    expect(await fingerprint(scratch)).toEqual(full);
  });
});
