// `pnpm --filter @originos/db rollback -- <steps> --destroy-data`: undo the
// newest applied migrations. Development and test only.
import { envFields, parseEnv } from "@originos/config";
import { z } from "zod";
import { createDatabase } from "./client.js";
import { rollbackMigrations } from "./rollback.js";

const RollbackEnv = z.object({
  DATABASE_URL: envFields.url,
  NODE_ENV: z.string().optional(),
});

async function main(): Promise<void> {
  const env = parseEnv("db:rollback", RollbackEnv);
  const args = process.argv.slice(2);
  if (env.NODE_ENV === "production")
    throw new Error("Rollback is refused when NODE_ENV=production.");
  if (!args.includes("--destroy-data"))
    throw new Error("Rolling back drops tables and their data. Pass --destroy-data to confirm.");
  const steps = Number(args.find((a) => /^\d+$/.test(a)) ?? "1");
  const database = createDatabase({ url: env.DATABASE_URL });
  try {
    const undone = await rollbackMigrations(database, steps);
    process.stdout.write(
      undone.length ? `Rolled back: ${undone.join(", ")}\n` : "Nothing to roll back.\n",
    );
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Rollback failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
