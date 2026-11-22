// `pnpm db:status`: a database nobody migrated reports every migration as
// pending (scripts/dev.sh then stops with "run pnpm db:migrate"), and a
// migrated one is ready. Uses a throwaway database, dropped afterwards.
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Database,
  createDatabase,
  databaseStatus,
  isReady,
  runMigrations,
} from "../../src/index.js";
import { readJournal } from "../../src/rollback.js";

const url = process.env.TEST_DATABASE_URL;
if (!url)
  throw new Error("TEST_DATABASE_URL must be set for integration tests (see .env.example).");

const name = `originos_status_${randomBytes(4).toString("hex")}`;
const admin = createDatabase({ url });
let scratch: Database;

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

describe("database status", () => {
  it("reports every migration as pending on a database nobody migrated", async () => {
    const status = await databaseStatus(scratch);
    expect(status.pending).toEqual(readJournal().map((e) => e.tag));
    expect(status.unknownApplied).toBe(0);
    expect(isReady(status)).toBe(false);
  });

  it("is ready once migrations have run", async () => {
    await runMigrations(scratch);
    const status = await databaseStatus(scratch);
    expect(status).toEqual({ pending: [], missingRoles: [], unknownApplied: 0 });
    expect(isReady(status)).toBe(true);
  });

  it("flags applied migrations this checkout does not know", async () => {
    await scratch.db.execute(
      sql`insert into drizzle.__drizzle_migrations (hash, created_at) values ('future', 9999999999999)`,
    );
    const status = await databaseStatus(scratch);
    expect(status.unknownApplied).toBe(1);
  });
});
