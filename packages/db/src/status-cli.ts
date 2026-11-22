// `pnpm db:status` from the repository root (scripts/dev.sh runs it too).
// Connects as DATABASE_URL's user and says whether the services can start.
// Exit codes: 0 ready, 1 cannot connect, 2 needs `pnpm db:migrate`, 3 the
// database is newer than this checkout. Never prints the connection string.
import { envFields, parseEnv } from "@originos/config";
import { z } from "zod";
import { createDatabase } from "./client.js";
import { databaseStatus, isReady } from "./status.js";

const StatusEnv = z.object({ DATABASE_URL: envFields.url });

function target(url: string): string {
  const u = new URL(url);
  return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
}

async function main(): Promise<number> {
  const env = parseEnv("db:status", StatusEnv);
  const where = target(env.DATABASE_URL);
  const database = createDatabase({ url: env.DATABASE_URL });
  try {
    let status;
    try {
      status = await databaseStatus(database);
    } catch (error) {
      // drizzle wraps the driver error; its cause holds the useful part (no credentials).
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
      const message = cause instanceof Error ? cause.message || cause.name : String(cause);
      process.stderr.write(
        [
          `Cannot reach the database at ${where}: ${message}`,
          "Fix: start it (docker compose up -d --wait postgres) and check that the port in",
          "DATABASE_URL matches POSTGRES_HOST_PORT in .env. If another Postgres runs on that",
          "port, move ours with POSTGRES_HOST_PORT and update DATABASE_URL to match.",
          "",
        ].join("\n"),
      );
      return 1;
    }
    if (status.unknownApplied > 0) {
      process.stderr.write(
        `The database at ${where} has ${status.unknownApplied} migration(s) this checkout does not know.\n` +
          "Fix: pull the latest code, or reset local data with scripts/db-reset-local.sh.\n",
      );
      return 3;
    }
    if (!isReady(status)) {
      const lines = [`The database at ${where} is not set up for this checkout.`];
      if (status.pending.length > 0) {
        lines.push(
          `  ${status.pending.length} migration(s) not applied: ${status.pending.join(", ")}`,
        );
      }
      if (status.missingRoles.length > 0) {
        lines.push(`  Missing role(s): ${status.missingRoles.join(", ")} (migrations create them)`);
      }
      lines.push("Fix: run  pnpm db:migrate  from the repository root, then start again.", "");
      process.stderr.write(lines.join("\n"));
      return 2;
    }
    process.stdout.write(`Database at ${where} is up to date.\n`);
    return 0;
  } finally {
    await database.close();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(
      `db:status failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  },
);
