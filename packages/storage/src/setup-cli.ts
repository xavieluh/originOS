// `pnpm --filter @originos/storage setup`: create the quarantine and files
// buckets in the configured (local) object store. Refused in production, where
// buckets, lifecycle rules and access policies are infrastructure (Phase 44).
import { storageFromEnv } from "./env.js";

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production")
    throw new Error("Bucket setup is for local development and tests.");
  const { store } = storageFromEnv();
  if (!store) throw new Error("S3_ENDPOINT is not set.");
  await store.ensureBuckets();
  process.stdout.write("Storage buckets are ready.\n");
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Storage setup failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
