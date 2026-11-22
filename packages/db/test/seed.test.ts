import { describe, expect, it } from "vitest";
import { SAMPLE_DATA_LABEL, SeedRefusedError, assertSeedAllowed, seedSets } from "../src/index.js";

describe("assertSeedAllowed", () => {
  const local = "postgres://u:p@127.0.0.1:5432/originos";

  it("allows a local non-production database", () => {
    expect(() => assertSeedAllowed({ nodeEnv: "development", databaseUrl: local })).not.toThrow();
    expect(() =>
      assertSeedAllowed({ nodeEnv: "test", databaseUrl: "postgres://u:p@localhost/x" }),
    ).not.toThrow();
  });

  it("refuses production even on localhost", () => {
    expect(() => assertSeedAllowed({ nodeEnv: "production", databaseUrl: local })).toThrow(
      SeedRefusedError,
    );
  });

  it("refuses a remote database unless explicitly allowed", () => {
    const remote = "postgres://u:p@db.example.com:5432/originos";
    expect(() => assertSeedAllowed({ nodeEnv: "development", databaseUrl: remote })).toThrow(
      /not on this machine/,
    );
    expect(() =>
      assertSeedAllowed({ nodeEnv: "development", databaseUrl: remote, allowNonLocal: true }),
    ).not.toThrow();
  });

  it("does not echo the connection string", () => {
    try {
      assertSeedAllowed({ nodeEnv: "production", databaseUrl: "postgres://u:hunter2@h/x" });
    } catch (error) {
      expect((error as Error).message).not.toContain("hunter2");
    }
  });
});

describe("seed sets", () => {
  it("are empty until Phase 06 defines tables, and the label is explicit", () => {
    expect(seedSets).toHaveLength(0);
    expect(SAMPLE_DATA_LABEL).toBe("[SAMPLE]");
  });
});
