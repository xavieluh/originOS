// `pnpm db:migrate` from the repository root. Connects as DATABASE_URL's user
// (the schema owner) and applies pending migrations in order.
import { envFields, parseEnv } from "@originos/config";
import { z } from "zod";
import { createDatabase } from "./client.js";
import { runMigrations } from "./migrate.js";

const MigrateEnv = z.object({ DATABASE_URL: envFields.url });

async function main(): Promise<void> {
  const env = parseEnv("db:migrate", MigrateEnv);
  const database = createDatabase({ url: env.DATABASE_URL });
  try {
    await runMigrations(database);
    process.stdout.write("Migrations applied.\n");
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  // drizzle wraps pg errors; print the message only (no connection string is included).
  process.stderr.write(
    `Migration failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
