// `pnpm --filter @originos/connect fake-provider`: run the fake OAuth provider
// for local development and browser tests. Refused in production.
import { loadLocalEnv } from "@originos/config";
import { startFakeProvider } from "./fake-provider.js";

async function main(): Promise<void> {
  loadLocalEnv();
  const secret = process.env.CONNECT_TEST_PROVIDER_CLIENT_SECRET;
  if (!secret) throw new Error("CONNECT_TEST_PROVIDER_CLIENT_SECRET is not set.");
  const provider = await startFakeProvider({
    clientId: process.env.CONNECT_TEST_PROVIDER_CLIENT_ID ?? "originos-local",
    clientSecret: secret,
    port: Number(process.env.CONNECT_TEST_PROVIDER_PORT ?? 4995),
  });
  process.stdout.write(`Fake OAuth provider (local testing only) on ${provider.url}\n`);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => void provider.close().then(() => process.exit(0)));
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Fake provider failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
