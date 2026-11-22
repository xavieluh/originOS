import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { GALLERY_ROUTE, NAV_ROUTES, SIGNED_IN_ROUTES, SIGNED_OUT_ROUTES } from "./routes";

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });
    for (const route of [...NAV_ROUTES, GALLERY_ROUTE, ...SIGNED_IN_ROUTES]) {
      test(`${route} has no axe violations`, async ({ page }) => {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        await expectNoViolations(page);
      });
    }
    test.describe("signed out", () => {
      test.use({ storageState: { cookies: [], origins: [] } });
      for (const route of SIGNED_OUT_ROUTES) {
        test(`${route} has no axe violations`, async ({ page }) => {
          await page.goto(route);
          await page.waitForLoadState("networkidle");
          await expectNoViolations(page);
        });
      }
    });
  });
}

test("command bar and drawer dialogs have no axe violations when open", async ({ page }) => {
  await page.goto(GALLERY_ROUTE);
  await page.getByRole("button", { name: "Open drawer" }).click();
  let results = await new AxeBuilder({ page }).include("dialog[open]").withTags(TAGS).analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Jump to/ }).click();
  results = await new AxeBuilder({ page }).include("dialog[open]").withTags(TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test("workspace switcher and account menu have no axe violations when open", async ({ page }) => {
  await page.goto("/home");
  await page.getByRole("button", { name: /^Workspace:/ }).click();
  await expectNoViolations(page);
  await page.getByRole("button", { name: /^Account:/ }).click();
  await expectNoViolations(page);
});
