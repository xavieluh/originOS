import { describe, expect, it } from "vitest";
import { createDatabase, pingDatabase } from "../src/index.js";

const clock = () => {
  let t = 0;
  return () => (t += 5);
};

describe("pingDatabase", () => {
  it("reports ok when the query succeeds", async () => {
    const result = await pingDatabase({ query: async () => ({}) } as never, clock());
    expect(result).toEqual({ ok: true, latencyMs: 5 });
  });

  it("classifies connection failures as unreachable", async () => {
    const pool = {
      query: async () => {
        throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
      },
    };
    const result = await pingDatabase(pool as never, clock());
    expect(result).toEqual({ ok: false, reason: "unreachable", latencyMs: 5 });
  });

  it("classifies server-side failures as error without leaking the message", async () => {
    const pool = {
      query: async () => {
        throw Object.assign(new Error('password authentication failed for user "admin"'), {
          code: "28P01",
        });
      },
    };
    const result = await pingDatabase(pool as never, clock());
    expect(result).toEqual({ ok: false, reason: "error", latencyMs: 5 });
    expect(JSON.stringify(result)).not.toContain("admin");
  });
});

// Runs only when a real database is provided, e.g.
// TEST_DATABASE_URL=postgres://... pnpm --filter @originos/db test
const realUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!realUrl)("pingDatabase against a real PostgreSQL", () => {
  it("round-trips select 1", async () => {
    const database = createDatabase({ url: realUrl ?? "" });
    try {
      const result = await pingDatabase(database.pool);
      expect(result.ok).toBe(true);
    } finally {
      await database.close();
    }
  });

  it("reports unreachable for a closed port", async () => {
    const database = createDatabase({ url: "postgres://nobody:x@127.0.0.1:1/none" });
    try {
      const result = await pingDatabase(database.pool);
      expect(result).toMatchObject({ ok: false, reason: "unreachable" });
    } finally {
      await database.close();
    }
  });
});
