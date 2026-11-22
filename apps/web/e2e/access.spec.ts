import { expect, test, type Browser, type Page } from "@playwright/test";
import { createOrganization, signUpAndVerify } from "./support/accounts";
import { firstLink, uniqueEmail, waitForMail } from "./support/mail";

// Phase 05: permissions, agents, grants and consent through the real UI and API.
// Each test creates its own people so tests can run in parallel.
test.use({ storageState: { cookies: [], origins: [] } });

async function newOwner(page: Page, name: string, org: string) {
  await signUpAndVerify(page, name, uniqueEmail("owner"));
  await createOrganization(page, org);
}

async function addMember(page: Page, browser: Browser, name: string, org: string) {
  const email = uniqueEmail("member");
  await page.goto("/settings");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible();
  const link = firstLink(await waitForMail(email, "invited you"));
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const member = await context.newPage();
  await signUpAndVerify(member, name, email);
  await member.goto(link);
  await member.getByRole("button", { name: `Join ${org}` }).click();
  await expect(member).toHaveURL(/\/home$/);
  return { context, page: member };
}

test("an agent starts with read-only access, can be denied more, and can be disabled", async ({
  page,
}) => {
  await newOwner(page, "Pat Policy", "Policy Works");
  await page.goto("/settings");
  await page.getByRole("link", { name: "Permissions and agents" }).click();
  await expect(page).toHaveURL(/\/settings\/access$/);
  await expect(page.getByRole("heading", { name: "Your permissions" })).toBeVisible();

  await page.getByLabel("Agent name").fill("Draft reviewer");
  await page.getByLabel("What it does").fill("Reviews drafts before publishing");
  await page.getByRole("button", { name: "Register agent" }).click();
  await expect(page.getByText("Registered Draft reviewer.")).toBeVisible();
  const agents = page.getByRole("region", { name: "Agents in this organization" });
  const row = agents.getByRole("row", { name: /Draft reviewer/ });
  await expect(row.getByText("Organization: read", { exact: true })).toBeVisible();

  // A deny on the agent removes even its default access.
  await page
    .getByLabel("Who", { exact: true })
    .selectOption({ label: "Draft reviewer (agent of Pat Policy)" });
  await page.getByLabel("Effect", { exact: true }).selectOption("deny");
  await page.getByLabel("Resource", { exact: true }).selectOption("organization");
  await page.getByLabel("read", { exact: true }).check();
  await page.getByLabel("Reason", { exact: true }).fill("Paused for review");
  await page.getByRole("button", { name: "Add deny" }).click();
  await expect(page.getByText("Deny added.")).toBeVisible();
  await expect(row.getByText("Nothing", { exact: true })).toBeVisible();

  // Revoking the deny restores the default.
  const grants = page.getByRole("region", { name: "Grants and denies" });
  await grants.getByRole("button", { name: "Revoke" }).click();
  await page.getByRole("button", { name: "Confirm revoke" }).click();
  await expect(page.getByText("Revoked.")).toBeVisible();
  await expect(row.getByText("Organization: read", { exact: true })).toBeVisible();

  await row.getByRole("button", { name: "Disable" }).click();
  await page.getByRole("button", { name: "Confirm disable" }).click();
  await expect(page.getByText("Draft reviewer is disabled.")).toBeVisible();
  await expect(row.getByText("disabled", { exact: true })).toBeVisible();

  await page.goto("/settings");
  const activity = page.getByRole("region", { name: "Organization activity" });
  for (const event of [
    "Registered an agent",
    "Disabled an agent",
    "Changed permissions (added a grant or deny)",
    "Changed permissions (revoked a grant or deny)",
  ]) {
    await expect(activity.getByText(event, { exact: true })).toBeVisible();
  }
});

test("consent can be given, inspected and revoked, with history kept", async ({ page }) => {
  await newOwner(page, "Cleo Consent", "Consent Co");
  await page.goto("/settings/consent");
  const telemetry = page
    .getByRole("list", { name: "Your consent" })
    .getByRole("listitem", { name: "Agent telemetry collection" });
  await expect(telemetry.getByText("not given")).toBeVisible();
  await telemetry.getByRole("button", { name: "Give consent" }).click();
  await expect(page.getByText("Agent telemetry collection: consent given.")).toBeVisible();
  await expect(telemetry.getByText("given", { exact: true })).toBeVisible();

  await telemetry.getByRole("button", { name: "Revoke" }).click();
  await telemetry.getByRole("button", { name: "Confirm revoke" }).click();
  await expect(page.getByText("Agent telemetry collection: revoked.")).toBeVisible();
  await expect(telemetry.getByText("not given")).toBeVisible();
  const history = page.getByRole("region", { name: "Your consent: history" });
  await expect(
    history.getByRole("row", { name: /Agent telemetry collection.*revoked/ }),
  ).toBeVisible();

  // Organization policies need a scope where one applies.
  const partner = page
    .getByRole("list", { name: "Organization policies" })
    .getByRole("listitem", { name: "Cross-organization policy" });
  await partner.getByLabel(/Partner organization/).fill("partner-lab");
  await partner.getByRole("button", { name: "Give consent" }).click();
  await expect(partner.getByText(/Partner organization: partner-lab/)).toBeVisible();
});

test("a member's controls follow their permissions, including a granted audit log", async ({
  page,
  browser,
}) => {
  await newOwner(page, "Gia Grantor", "Grant Hall");
  const member = await addMember(page, browser, "Mo Member", "Grant Hall");

  await member.page.goto("/settings/access");
  await expect(member.page.getByRole("heading", { name: "Your permissions" })).toBeVisible();
  await expect(member.page.getByRole("heading", { name: "Grants and denies" })).toHaveCount(0);
  await member.page.goto("/settings");
  await expect(member.page.getByRole("heading", { name: "Activity" })).toHaveCount(0);
  await member.page.goto("/settings/consent");
  await expect(
    member.page.getByRole("list", { name: "Organization policies" }).getByRole("button"),
  ).toHaveCount(0);

  await page.goto("/settings/access");
  await page.getByLabel("Who", { exact: true }).selectOption({ label: "Mo Member (member)" });
  await page.getByLabel("Effect", { exact: true }).selectOption("allow");
  await page.getByLabel("Resource", { exact: true }).selectOption("audit_log");
  await page.getByLabel("read", { exact: true }).check();
  await page.getByRole("button", { name: "Add grant" }).click();
  await expect(page.getByText("Grant added.")).toBeVisible();

  await member.page.goto("/settings");
  await expect(member.page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await member.context.close();
});
