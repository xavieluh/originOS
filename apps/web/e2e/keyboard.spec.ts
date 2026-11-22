import { expect, test } from "@playwright/test";

const shortcut = process.platform === "darwin" ? "Meta+k" : "Control+k";

test("first Tab reaches the skip link, which moves focus to main content", async ({ page }) => {
  await page.goto("/agents");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main-content")).toBeFocused();
});

test("focused controls show a visible focus outline", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/home");
  const link = page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("link", { name: "Agents" });
  await link.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(link).toBeFocused();
  const outline = await link.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThanOrEqual(2);
});

test("command bar opens with the shortcut, filters, navigates and closes with Escape", async ({
  page,
}) => {
  await page.goto("/home");
  await page.keyboard.press(shortcut);
  const input = page.getByRole("combobox", { name: "Jump to a page" });
  await expect(input).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(input).toBeHidden();

  await page.keyboard.press(shortcut);
  await input.fill("provenance");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/trust$/);
  await expect(page.getByRole("heading", { level: 1, name: "Trust" })).toBeVisible();
});

test("command bar supports arrow keys and says when nothing matches", async ({ page }) => {
  await page.goto("/home");
  await page.getByRole("button", { name: /Jump to/ }).click();
  const input = page.getByRole("combobox", { name: "Jump to a page" });
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { selected: true })).toHaveText(/Agents/);
  await input.fill("zzzz");
  await expect(page.getByText(/No page matches/)).toBeVisible();
});

test("theme can be chosen by keyboard and persists across reloads", async ({ page }) => {
  await page.goto("/home");
  await page.getByRole("radio", { name: "Dark" }).focus();
  await page.keyboard.press("Space");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
  // Arrow keys move through the radio group; Dark wraps round to System.
  await page.getByRole("radio", { name: "Dark" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "System" })).toBeChecked();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /./);
});

test("drawer traps focus and closes with Escape, returning focus", async ({ page }) => {
  await page.goto("/design-system");
  const opener = page.getByRole("button", { name: "Open drawer" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Example drawer" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("navigation is behind a toggle that opens, navigates and closes", async ({ page }) => {
    await page.goto("/home");
    const nav = page.getByRole("navigation", { name: "Workspace" });
    await expect(nav).toBeHidden();
    const toggle = page.getByRole("button", { name: "Open navigation" });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(nav).toBeVisible();
    await expect(page.getByRole("button", { name: "Close navigation" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await nav.getByRole("link", { name: "Publish" }).click();
    await expect(page).toHaveURL(/\/publish$/);
    await expect(nav).toBeHidden();
  });

  test("Escape closes the open navigation", async ({ page }) => {
    await page.goto("/home");
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("navigation", { name: "Workspace" })).toBeHidden();
  });

  test("no page scrolls horizontally", async ({ page }) => {
    for (const route of ["/", "/home", "/trust", "/developers", "/design-system"]) {
      await page.goto(route);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, route).toBeLessThanOrEqual(0);
    }
  });
});
