// `pnpm db:seed` from the repository root. Loads env, checks the guard, runs seed sets.
import { envFields, loadLocalEnv, parseEnv } from "@originos/config";
import { z } from "zod";
import { createDatabase } from "./client.js";
import { assertSeedAllowed, seedSets } from "./seed.js";

const SeedEnv = z.object({
  NODE_ENV: envFields.nodeEnv,
  DATABASE_URL: envFields.url,
  SEED_ALLOW_NON_LOCAL: z.enum(["true", "false"]).default("false"),
});

async function main(): Promise<void> {
  loadLocalEnv();
  const env = parseEnv("db:seed", SeedEnv);
  assertSeedAllowed({
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    allowNonLocal: env.SEED_ALLOW_NON_LOCAL === "true",
  });
  if (seedSets.length === 0) {
    process.stdout.write("No seed sets are registered yet; the first tables arrive in Phase 06.\n");
    return;
  }
  const database = createDatabase({ url: env.DATABASE_URL });
  try {
    for (const set of seedSets) {
      process.stdout.write(`Seeding ${set.name}: ${set.description}\n`);
      await set.run(database);
    }
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
