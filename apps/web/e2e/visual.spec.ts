import { expect, test } from "@playwright/test";

/**
 * Visual regression fixtures. Baselines live in e2e/visual.spec.ts-snapshots and
 * must be (re)generated in the Playwright container so they match CI:
 *   pnpm --filter @originos/web test:e2e:docker -- --update-snapshots visual
 */
const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1440, height: 900 },
} as const;

const PAGES = [
  ["public", "/"],
  ["home", "/home"],
  ["agents", "/agents"],
  ["developers", "/developers"],
  ["gallery", "/design-system"],
] as const;

for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(vpName, () => {
    test.use({ viewport });
    for (const [name, route] of PAGES) {
      test(`${name}`, async ({ page }) => {
        await page.goto(route);
        await page.evaluate(() => document.fonts.ready);
        await expect(page).toHaveScreenshot(`${name}-${vpName}.png`, { fullPage: true });
      });
    }
  });
}

test.describe("dark", () => {
  test.use({ viewport: VIEWPORTS.desktop, colorScheme: "dark" });
  for (const [name, route] of PAGES) {
    test(`${name}`, async ({ page }) => {
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`${name}-dark.png`, { fullPage: true });
    });
  }
});

test("mobile navigation open", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto("/home");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("nav-open-mobile.png");
});

test("command bar open", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/home");
  await page.getByRole("button", { name: /Jump to/ }).click();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("command-bar-desktop.png");
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const vpName of ["mobile", "desktop"] as const) {
    test(`sign-in ${vpName}`, async ({ page }) => {
      await page.setViewportSize(VIEWPORTS[vpName]);
      await page.goto("/sign-in");
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`sign-in-${vpName}.png`, { fullPage: true });
    });
  }
});
