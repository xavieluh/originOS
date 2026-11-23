import { connectFromEnv } from "@originos/connect";
import { WORKER_ROLE, createDatabase } from "@originos/db";
import { storageFromEnv } from "@originos/storage";
import { loadWorkerEnv } from "./env.js";
import { createWorker } from "./worker.js";

async function main(): Promise<void> {
  const env = loadWorkerEnv();
  const database = env.DATABASE_URL
    ? createDatabase({ url: env.DATABASE_URL, role: WORKER_ROLE })
    : null;
  const worker = createWorker(env, database, {
    storage: storageFromEnv(),
    connect: connectFromEnv(),
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => void worker.stop().then(() => process.exit(0)));
  }
  // The worker role reaches jobs, uploads, connections and the outbox only; it sees no other tenant data.
  worker.jobs?.start(env.JOB_POLL_MS);
  worker.outbox?.start(env.OUTBOX_POLL_MS);
  await worker.health.listen({ port: env.WORKER_HEALTH_PORT, host: env.WORKER_HEALTH_HOST });
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
