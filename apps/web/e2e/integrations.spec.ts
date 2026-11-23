import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./env";
import { createOrganization, signUpAndVerify } from "./support/accounts";
import { uniqueEmail } from "./support/mail";

// Phase 08: connect, check and disconnect through the real UI, API, worker and
// the fake OAuth provider (local testing only; it is not a real service).
test.use({ storageState: { cookies: [], origins: [] } });

/** Record every response the browser gets from the web app, to search for leaked tokens. */
function captureAppResponses(page: Page): string[] {
  const bodies: string[] = [];
  page.on("response", (response) => {
    if (!response.url().startsWith(E2E.webUrl)) return;
    void response
      .text()
      .then((t) => bodies.push(`${response.url()}\n${t}`))
      .catch(() => undefined);
  });
  return bodies;
}

const connections = (page: Page) => page.getByRole("region", { name: "Connected accounts" });

test("connect with permission disclosures, check, and disconnect without exposing tokens", async ({
  page,
}) => {
  const bodies = captureAppResponses(page);
  await signUpAndVerify(page, "Cleo Connect", uniqueEmail("connect"));
  await createOrganization(page, "Connect Co");
  await page.goto("/integrations");

  // Disclosures before connecting; GitHub shows its truthful setup-required state.
  const card = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Test provider (local testing only)" }) });
  await expect(card.getByText("local testing only", { exact: true })).toBeVisible();
  await expect(card.getByText(/Read the test account's id and name/)).toBeVisible();
  await expect(card.getByText(/never shown in the browser/)).toBeVisible();
  const github = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "GitHub", exact: true }) });
  await expect(github.getByText("not set up", { exact: true })).toBeVisible();
  await expect(github.getByText(/GITHUB_OAUTH_CLIENT_ID/)).toBeVisible();
  await expect(github.getByRole("button")).toHaveCount(0);

  await card.getByRole("button", { name: /Connect Test provider/ }).click();
  await expect(page).toHaveURL(new RegExp(`^${E2E.fakeProviderUrl}/oauth/authorize`));
  await expect(page.getByText(/OriginOS is asking for: profile, echo/)).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();

  await expect(page).toHaveURL(/\/integrations\?connected=test-provider$/);
  await expect(page.getByText("Test provider (local testing only) is connected.")).toBeVisible();
  const row = connections(page).getByRole("row", { name: /test-user/ });
  await expect(row.getByText("connected", { exact: true })).toBeVisible();
  await expect(row.getByText("profile echo")).toBeVisible();
  await expect(row.getByText(/\/v1\/webhooks\/test-provider\/con_/)).toBeVisible();

  await row.getByRole("button", { name: "Check connection" }).click();
  await expect(page.getByText(/Checking test-user/)).toBeVisible();
  await expect(async () => {
    await page.reload();
    await expect(connections(page).getByText(/Last checked/)).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });

  await connections(page).getByRole("button", { name: "Disconnect" }).click();
  await connections(page).getByRole("button", { name: "Confirm disconnect" }).click();
  await expect(page.getByText(/test-user is disconnected/)).toBeVisible();
  await expect(connections(page).getByText("disconnected", { exact: true })).toBeVisible();
  await expect(connections(page).getByRole("button", { name: "Check connection" })).toHaveCount(0);

  // The provider's tokens never reached the browser: not in any page, action response or storage.
  await page.waitForLoadState("networkidle");
  expect(bodies.length).toBeGreaterThan(3);
  for (const body of bodies) expect(body).not.toContain(E2E.fakeTokenPrefix);
  const storage = await page.evaluate(() =>
    JSON.stringify({ ...localStorage, cookie: document.cookie }),
  );
  expect(storage).not.toContain(E2E.fakeTokenPrefix);
});

test("denying at the provider connects nothing", async ({ page }) => {
  await signUpAndVerify(page, "Dan Deny", uniqueEmail("deny"));
  await createOrganization(page, "Deny Co");
  await page.goto("/integrations");
  await page.getByRole("button", { name: /Connect Test provider/ }).click();
  await expect(page).toHaveURL(new RegExp(`^${E2E.fakeProviderUrl}/oauth/authorize`));
  await page.getByRole("button", { name: "Deny", exact: true }).click();
  await expect(page).toHaveURL(/\/integrations\?error=denied/);
  await expect(page.getByText("The connection was not approved at the provider.")).toBeVisible();
  await expect(page.getByText("No connections yet")).toBeVisible();
});

test("a replayed callback is refused", async ({ page }) => {
  await signUpAndVerify(page, "Rita Replay", uniqueEmail("replay"));
  await createOrganization(page, "Replay Co");
  await page.goto("/integrations");
  await page.getByRole("button", { name: /Connect Test provider/ }).click();
  await expect(page).toHaveURL(new RegExp(`^${E2E.fakeProviderUrl}/oauth/authorize`));
  const callback = page.waitForRequest((r) =>
    r.url().includes("/integrations/callback/test-provider"),
  );
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  const url = (await callback).url();
  await expect(page).toHaveURL(/connected=test-provider/);
  await page.goto(url);
  await expect(page).toHaveURL(/error=state_used/);
  await expect(page.getByText("That connection attempt was already used.")).toBeVisible();
});
