import { expect, test } from "@playwright/test";
import { E2E } from "./env";
import {
  BUTTON_ACTIONS,
  GALLERY_ROUTE,
  NAV_ROUTES,
  PLANNED_COUNT,
  SIGNED_IN_ROUTES,
  SIGNED_OUT_ROUTES,
} from "./routes";

for (const route of NAV_ROUTES) {
  test(`${route} resolves and is honest about unbuilt features`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("[data-not-yet-available]")).toHaveCount(PLANNED_COUNT[route] ?? -1);
    for (const badge of await page.getByText(/Not yet available · Phase \d{2}/).all()) {
      await expect(badge).toBeVisible();
    }
  });

  test(`${route} has no dead buttons or broken links`, async ({ page, request }) => {
    await page.goto(route);
    const actions = await page
      .locator("button")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-action")));
    for (const action of actions)
      expect(BUTTON_ACTIONS, `button with data-action=${action}`).toContain(action);

    const hrefs = await page
      .locator("a[href]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of new Set(hrefs)) {
      if (href.startsWith("#")) {
        await expect(page.locator(href)).toHaveCount(1);
        continue;
      }
      expect(href.startsWith("/"), `only internal links exist yet: ${href}`).toBe(true);
      expect((await request.get(href)).status(), href).toBe(200);
    }
  });
}

test("the sidebar marks the current section", async ({ page }) => {
  await page.goto("/research");
  const nav = page.getByRole("navigation", { name: "Workspace" });
  await expect(nav.getByRole("link", { name: "Research" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current", "page");
});

test("the system status card reads the live API and database state", async ({ page }) => {
  await page.goto("/home");
  // The E2E stack runs a real API and Postgres (playwright.config.ts). The unreachable
  // and not-ready states are covered by unit tests of describeApi.
  await expect(page.getByTestId("system-status")).toContainText("Ready");
});

test("the workspace switcher and account menu show the signed-in person", async ({ page }) => {
  await page.goto("/home");
  await page.getByRole("button", { name: `Workspace: ${E2E.ownerOrganization}` }).click();
  await expect(
    page.getByRole("button", { name: new RegExp(E2E.ownerOrganization) }).last(),
  ).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: `Workspace: ${E2E.ownerOrganization}` }),
  ).toBeFocused();
  await page.getByRole("button", { name: `Account: ${E2E.ownerName}` }).click();
  await expect(page.getByRole("link", { name: "Account and security" })).toBeVisible();
});

for (const route of [...SIGNED_IN_ROUTES]) {
  test(`${route} has no dead buttons`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const actions = await page
      .locator("button")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-action")));
    for (const action of actions)
      expect(BUTTON_ACTIONS, `button with data-action=${action}`).toContain(action);
  });
}

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const route of SIGNED_OUT_ROUTES) {
    test(`${route} has one heading and no dead buttons or links`, async ({ page, request }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("h1")).toHaveCount(1);
      const actions = await page
        .locator("button")
        .evaluateAll((els) => els.map((e) => e.getAttribute("data-action")));
      for (const action of actions)
        expect(BUTTON_ACTIONS, `button with data-action=${action}`).toContain(action);
      const hrefs = await page
        .locator("a[href]")
        .evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
      for (const href of new Set(hrefs)) {
        if (href.startsWith("#")) continue;
        expect(href.startsWith("/"), href).toBe(true);
        expect((await request.get(href, { maxRedirects: 0 })).status(), href).toBeLessThan(400);
      }
    });
  }
});

test("unknown routes return 404 with a way back", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This page does not exist" })).toBeVisible();
});

test("gallery buttons all do something visible", async ({ page }) => {
  await page.goto(GALLERY_ROUTE);
  for (const name of ["Primary", "Secondary", "Ghost", "Danger", "Small"]) {
    await page.getByRole("button", { name, exact: true }).click();
  }
  await expect(page.getByTestId("press-count")).toHaveText("Pressed 5 times.");
  await expect(page.getByRole("button", { name: "Disabled" })).toBeDisabled();

  await page.getByRole("button", { name: "Check form" }).click();
  await expect(page.getByRole("textbox", { name: /Handle/ })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.getByRole("textbox", { name: /Handle/ }).fill("ada-lovelace");
  await page.getByRole("button", { name: "Check form" }).click();
  await expect(
    page.getByText("“ada-lovelace” is a valid handle. Nothing was saved."),
  ).toBeVisible();
});
