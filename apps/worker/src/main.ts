import { createDatabase } from "@originos/db";
import { loadWorkerEnv } from "./env.js";
import { createWorker } from "./worker.js";

async function main(): Promise<void> {
  const env = loadWorkerEnv();
  const database = env.DATABASE_URL ? createDatabase({ url: env.DATABASE_URL }) : null;
  const worker = createWorker(env, database);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => void worker.stop().then(() => process.exit(0)));
  }
  await worker.health.listen({ port: env.WORKER_HEALTH_PORT, host: env.WORKER_HEALTH_HOST });
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
