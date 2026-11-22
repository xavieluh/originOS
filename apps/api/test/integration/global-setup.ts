// Apply migrations once, before any integration test file runs. Test files run
// in parallel, and concurrent first-time migrations on an empty database race
// on creating drizzle's journal table.
import { createDatabase, runMigrations } from "@originos/db";

export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url)
    throw new Error("TEST_DATABASE_URL must be set for integration tests (see .env.example).");
  const owner = createDatabase({ url });
  try {
    await runMigrations(owner);
  } finally {
    await owner.close();
  }
}
