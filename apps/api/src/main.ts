import { createDatabase } from "@originos/db";
import { createApi } from "./app.js";
import { loadApiEnv } from "./config/env.js";

async function main(): Promise<void> {
  const env = loadApiEnv();
  const database = env.DATABASE_URL ? createDatabase({ url: env.DATABASE_URL }) : null;
  const app = await createApi({ database, logLevel: env.LOG_LEVEL });
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
