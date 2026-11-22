import { loadEnv } from "./env.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const app = buildServer(env);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => void app.close().then(() => process.exit(0)));
  }
  await app.listen({ port: env.TELEMETRY_PORT, host: env.TELEMETRY_HOST });
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
