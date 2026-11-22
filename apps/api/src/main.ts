import { APPLICATION_ROLE, createDatabase } from "@originos/db";
import { storageFromEnv } from "@originos/storage";
import { createApi } from "./app.js";
import { loadApiEnv } from "./config/env.js";
import { createMailer } from "./modules/core/index.js";

async function main(): Promise<void> {
  const env = loadApiEnv();
  // Every pooled connection switches to the non-superuser application role, so
  // row-level security applies to all API queries (ADR-023).
  const database = env.DATABASE_URL
    ? createDatabase({ url: env.DATABASE_URL, role: APPLICATION_ROLE })
    : null;
  const app = await createApi({
    database,
    logLevel: env.LOG_LEVEL,
    mailer: createMailer(env),
    publicUrl: env.ORIGINOS_PUBLIC_URL,
    authRateLimit: env.AUTH_RATE_LIMIT === "on",
    storage: storageFromEnv(),
    ...(env.BETTER_AUTH_SECRET ? { authSecret: env.BETTER_AUTH_SECRET } : {}),
  });
  if (database) {
    app
      .getHttpAdapter()
      .getInstance()
      .addHook("onClose", async () => database.close());
  }
  await app.listen({ port: env.API_PORT, host: env.API_HOST });
}

main().catch((error: unknown) => {
  // EnvValidationError messages name variables only, never values.
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
