import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
    globalSetup: ["test/integration/global-setup.ts"],
    // The outbox and job tests claim from shared queues (all tenants), so the
    // files run one after another instead of claiming each other's work.
    fileParallelism: false,
  },
});
