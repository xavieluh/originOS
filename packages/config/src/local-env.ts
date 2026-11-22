// Command-line tools (db:migrate, db:status, db:seed, storage setup) load the
// repository's .env themselves, so they work when run by hand from any shell
// without exporting it first. Services do not call this: scripts/dev.sh and
// the deployment environment provide their variables.
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Load `<repo root>/.env` into process.env, if it exists. Variables already
 * set in the environment win. Skipped when NODE_ENV=production, where only the
 * real environment counts. Returns the file loaded, or null.
 */
export function loadLocalEnv(startDir: string = process.cwd()): string | null {
  if (process.env.NODE_ENV === "production") return null;
  let dir = path.resolve(startDir);
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      const file = path.join(dir, ".env");
      if (!existsSync(file)) return null;
      process.loadEnvFile(file);
      return file;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
