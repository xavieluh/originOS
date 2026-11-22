import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadLocalEnv } from "../src/index.js";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

function repo(env: string | null) {
  const root = mkdtempSync(path.join(tmpdir(), "originos-env-"));
  writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages: []\n");
  if (env !== null) writeFileSync(path.join(root, ".env"), env);
  const nested = path.join(root, "packages", "db");
  mkdirSync(nested, { recursive: true });
  return { root, nested };
}

describe("loadLocalEnv", () => {
  it("finds the repository's .env from a package folder and loads it", () => {
    const { root, nested } = repo(
      "# comment\nORIGINOS_T_A=from-file\nORIGINOS_T_B='quoted value'\n",
    );
    delete process.env.NODE_ENV;
    expect(loadLocalEnv(nested)).toBe(path.join(root, ".env"));
    expect(process.env.ORIGINOS_T_A).toBe("from-file");
    expect(process.env.ORIGINOS_T_B).toBe("quoted value");
  });

  it("does not override variables already set", () => {
    const { nested } = repo("ORIGINOS_T_A=from-file\n");
    delete process.env.NODE_ENV;
    process.env.ORIGINOS_T_A = "from-shell";
    loadLocalEnv(nested);
    expect(process.env.ORIGINOS_T_A).toBe("from-shell");
  });

  it("does nothing without a .env, or in production", () => {
    const missing = repo(null);
    delete process.env.NODE_ENV;
    expect(loadLocalEnv(missing.nested)).toBeNull();
    const prod = repo("ORIGINOS_T_C=x\n");
    process.env.NODE_ENV = "production";
    expect(loadLocalEnv(prod.nested)).toBeNull();
    expect(process.env.ORIGINOS_T_C).toBeUndefined();
  });
});
