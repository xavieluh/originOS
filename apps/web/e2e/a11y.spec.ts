import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { GALLERY_ROUTE, NAV_ROUTES } from "./routes";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });
    for (const route of [...NAV_ROUTES, GALLERY_ROUTE]) {
      test(`${route} has no axe violations`, async ({ page }) => {
        await page.goto(route);
        const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        expect(
          results.violations.map(
            (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
          ),
        ).toEqual([]);
      });
    }
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
