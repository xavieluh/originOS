// Runs against a real PostgreSQL: `pnpm --filter @originos/db test:integration`
// with TEST_DATABASE_URL set (compose provides originos_test; CI uses a service container).
import { describe, expect, it } from "vitest";
import { createDatabase, databaseHealthCheck, pingDatabase } from "../../src/index.js";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL must be set for integration tests (see .env.example).");
}

describe("PostgreSQL integration", () => {
  it("round-trips select 1 and reports ok readiness", async () => {
    const database = createDatabase({ url });
    try {
      expect((await pingDatabase(database.pool)).ok).toBe(true);
      expect((await databaseHealthCheck(database)).status).toBe("ok");
    } finally {
      await database.close();
    }
  });

  it("has the pgvector extension available", async () => {
    const database = createDatabase({ url });
    try {
      await database.pool.query("create extension if not exists vector");
      const result = await database.pool.query<{ distance: number }>(
        "select '[1,2,3]'::vector <-> '[1,2,4]'::vector as distance",
      );
      expect(Number(result.rows[0]?.distance)).toBeCloseTo(1);
    } finally {
      await database.close();
    }
  });

  it("reports unreachable for a closed port", async () => {
    const database = createDatabase({ url: "postgres://nobody:x@127.0.0.1:1/none" });
    try {
      expect(await pingDatabase(database.pool)).toMatchObject({ ok: false, reason: "unreachable" });
    } finally {
      await database.close();
    }
  });
});
