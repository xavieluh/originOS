import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // "server-only" throws outside a React Server Components bundle; tests run plain Node.
    alias: { "server-only": new URL("./test/server-only-stub.ts", import.meta.url).pathname },
  },
});
