import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Playwright specs in e2e/ run with `pnpm test:e2e`, not Vitest.
    include: ["test/**/*.test.{ts,tsx}"],
  },
  resolve: {
    // "server-only" throws outside a React Server Components bundle; tests run plain Node.
    alias: { "server-only": new URL("./test/server-only-stub.ts", import.meta.url).pathname },
  },
});
