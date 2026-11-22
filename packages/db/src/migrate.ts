import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Database } from "./client.js";

/** packages/db/migrations, resolved from both src/ (tests) and dist/ (CLI). */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../migrations", import.meta.url));

/**
 * Apply pending migrations. Must run as the schema owner (no `role` option):
 * migration 0001 creates the application role and its grants.
 */
export async function runMigrations(database: Database): Promise<void> {
  await migrate(database.db, { migrationsFolder: MIGRATIONS_FOLDER, migrationsSchema: "drizzle" });
}
