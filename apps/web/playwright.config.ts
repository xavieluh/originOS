import { defineConfig, devices } from "@playwright/test";
import { E2E } from "./e2e/env";

/**
 * E2E, accessibility, keyboard, auth and visual tests against production builds
 * of the web app and the API, with a real Postgres and a local mail catcher
 * (Mailpit): `docker compose up -d postgres mail` first. Visual baselines are
 * generated in mcr.microsoft.com/playwright:v1.65.1-noble (ADR-021), which CI
 * also uses, so fonts and rendering match.
 *
 * The browser uses http://localhost (not 127.0.0.1) because passkeys need a
 * hostname as their relying-party ID, and it must equal ORIGINOS_PUBLIC_URL.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: E2E.webUrl, trace: "off" },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" } },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: E2E.ownerState },
      dependencies: ["setup"],
    },
  ],
  webServer: [
    {
      // Migrate the test database, then start the API exactly as in production.
      command: "node ../../packages/db/dist/migrate-cli.js && node ../api/dist/main.js",
      url: `${E2E.apiUrl}/health/live`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        NODE_ENV: "test",
        LOG_LEVEL: "warn",
        API_HOST: "127.0.0.1",
        API_PORT: String(E2E.apiPort),
        DATABASE_URL: E2E.databaseUrl,
        ORIGINOS_PUBLIC_URL: E2E.webUrl,
        BETTER_AUTH_SECRET: "originos-local-only-e2e-auth-secret-0123456789",
        SMTP_URL: E2E.smtpUrl,
        MAIL_FROM: "OriginOS E2E <no-reply@localhost>",
        // Every test request comes from one address; per-IP limits would make runs flaky.
        AUTH_RATE_LIMIT: "off",
      },
    },
    {
      command: `./node_modules/.bin/next start --hostname 127.0.0.1 --port ${E2E.webPort}`,
      url: `${E2E.webUrl}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        NEXT_TELEMETRY_DISABLED: "1",
        ORIGINOS_API_URL: E2E.apiUrl,
        ORIGINOS_PUBLIC_URL: E2E.webUrl,
        ORIGINOS_DEV_MAILBOX_URL: E2E.mailpitUrl,
        ORIGINOS_ENABLE_GALLERY: "true",
      },
    },
  ],
});
