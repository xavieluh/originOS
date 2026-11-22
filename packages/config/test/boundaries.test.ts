import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM module without type declarations
import { checkImport } from "../eslint/boundaries.mjs";

const rootDir = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const at = (rel: string) => path.join(rootDir, rel);
const check = (from: string, specifier: string): string | undefined =>
  checkImport(rootDir, at(from), specifier);

describe("checkImport (boundary policy)", () => {
  it("allows the API and worker to use the database package", () => {
    expect(check("apps/api/src/main.ts", "@originos/db")).toBeUndefined();
    expect(check("apps/worker/src/main.ts", "@originos/db")).toBeUndefined();
  });

  it.each([
    "apps/web/src/app/page.tsx",
    "apps/mcp-server/src/main.ts",
    "services/telemetry/src/main.ts",
    "services/media-validator/src/main.ts",
    "packages/ui/src/index.ts",
  ])("forbids database access from %s", (from) => {
    expect(check(from, "@originos/db")).toMatch(/may not access the database/);
    expect(check(from, "pg")).toMatch(/may not access the database/);
    expect(check(from, "drizzle-orm/pg-core")).toMatch(/may not access the database/);
  });

  it("forbids importing one deployable from another", () => {
    expect(check("apps/web/src/x.ts", "@originos/api")).toMatch(/may not import the deployable/);
    expect(check("packages/ui/src/x.ts", "@originos/web")).toMatch(/may not import the deployable/);
  });

  it("forbids relative imports that leave the workspace package", () => {
    expect(check("apps/web/src/x.ts", "../../api/src/main.js")).toMatch(/leaves apps\/web/);
    expect(check("apps/web/src/app/x.ts", "../lib/y.js")).toBeUndefined();
  });

  it("keeps contracts a leaf package", () => {
    expect(check("packages/contracts/src/x.ts", "zod")).toBeUndefined();
    expect(check("packages/contracts/src/x.ts", "@originos/config")).toMatch(/leaf package/);
    expect(check("packages/contracts/test/x.test.ts", "vitest")).toBeUndefined();
  });

  it("only allows another API module through its index", () => {
    const from = "apps/api/src/modules/alpha/alpha.service.ts";
    expect(check(from, "../beta/index.js")).toBeUndefined();
    expect(check(from, "../beta")).toBeUndefined();
    expect(check(from, "../beta/beta.repository.js")).toMatch(/only be imported through its index/);
    expect(check(from, "./alpha.repository.js")).toBeUndefined();
    expect(check("apps/api/src/app.module.ts", "./modules/beta/beta.service.js")).toMatch(
      /only be imported through its index/,
    );
  });
});

describe("eslint integration (violation fixtures)", () => {
  const eslint = new ESLint({ cwd: rootDir });

  async function lintAs(relPath: string, code: string) {
    const [result] = await eslint.lintText(code, { filePath: at(relPath) });
    return (result?.messages ?? []).filter((m) => m.ruleId === "originos/boundaries");
  }

  it("fails lint when the web app imports the database", async () => {
    const messages = await lintAs(
      "apps/web/src/__fixture__.ts",
      'import { createDatabase } from "@originos/db";\nexport const db = createDatabase;\n',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.severity).toBe(2);
  });

  it("fails lint when an API module reaches into another module's internals", async () => {
    const messages = await lintAs(
      "apps/api/src/modules/alpha/__fixture__.ts",
      'export { thing } from "../beta/beta.repository.js";\n',
    );
    expect(messages).toHaveLength(1);
  });

  it("passes lint for an allowed import", async () => {
    const messages = await lintAs(
      "apps/api/src/__fixture__.ts",
      'import { createDatabase } from "@originos/db";\nexport const db = createDatabase;\n',
    );
    expect(messages).toHaveLength(0);
  });
});
