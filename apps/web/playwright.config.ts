import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * E2E, accessibility, keyboard and visual tests against a production build.
 * Visual baselines are generated in mcr.microsoft.com/playwright:v1.65.1-noble
 * (ADR-021), which CI also uses, so fonts and rendering match.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "off" },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The API deliberately points at a closed port: pages must show "Unreachable", never a fake "Ready".
    command: `./node_modules/.bin/next start --hostname 127.0.0.1 --port ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      ORIGINOS_API_URL: "http://127.0.0.1:4999",
      ORIGINOS_ENABLE_GALLERY: "true",
    },
  },
});
