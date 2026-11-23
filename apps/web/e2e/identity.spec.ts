import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E } from "./env";
import { createOrganization, signUpAndVerify } from "./support/accounts";
import { firstLink, uniqueEmail, waitForMail } from "./support/mail";

// Phase 09: IdentityMesh through the real UI, API and worker. Domain lookups
// are answered from a TEST fixture file the worker reads (it never touches the
// internet here); account proofs use the fake OAuth provider (test-only).
test.use({ storageState: { cookies: [], origins: [] } });

const suffix = () => Math.random().toString(36).slice(2, 8);

/** Publish a DNS TXT record "on the internet" the E2E worker consults. */
function publishTxt(domain: string, value: string) {
  const file = E2E.challengeFixtureFile;
  mkdirSync(dirname(file), { recursive: true });
  let fixtures: { dns?: Record<string, string[]> } = {};
  try {
    fixtures = JSON.parse(readFileSync(file, "utf8")) as typeof fixtures;
  } catch {
    fixtures = {};
  }
  fixtures.dns = { ...fixtures.dns, [`_originos-challenge.${domain}`]: [value] };
  writeFileSync(file, JSON.stringify(fixtures));
}

async function createProfile(page: Page, handle: string, name: string, pseudonym: boolean) {
  await page.goto("/trust");
  await page.getByRole("link", { name: "Profiles" }).click();
  await expect(page).toHaveURL(/\/trust\/profiles$/);
  await page.getByLabel("Handle").fill(handle);
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Who can see it").selectOption("public");
  if (pseudonym) await page.getByLabel("This name is a pseudonym").check();
  await page.getByRole("button", { name: "Create profile" }).click();
  await expect(page).toHaveURL(/\/trust\/profiles\/prf_/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
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

test("a pseudonymous creator proves a domain only by a passed challenge; the public page labels it and never shows the legal name", async ({
  page,
}) => {
  const legalName = "Margarethe Legalname";
  const email = uniqueEmail("pseudo");
  const handle = `owl-${suffix()}`;
  const domain = `owl-${suffix()}.example.com`;
  await signUpAndVerify(page, legalName, email);
  await createOrganization(page, "Night Press");
  await createProfile(page, handle, "Night Owl", true);
  await expect(page.getByText("No checked facts yet.", { exact: false })).toBeVisible();

  // Typing a domain proves nothing: it waits for the check.
  await page.locator("#proof-domain").fill(domain);
  await page.getByRole("button", { name: "Get a challenge" }).click();
  const proofs = page.getByRole("list", { name: "Proofs" });
  await expect(proofs.getByText("waiting for the check")).toBeVisible();
  await expect(proofs.getByText(`_originos-challenge.${domain}`)).toBeVisible();
  const value = (await proofs.locator("[data-challenge]").innerText()).trim();
  expect(value).toMatch(/^originos-verify=[a-z2-7]{32}$/);

  // The record is not there yet: the check runs and says so.
  await proofs.getByRole("button", { name: "Check now" }).click();
  await expect(async () => {
    await page.reload();
    await expect(proofs.getByText(/Last check: No TXT record was found/)).toBeVisible({
      timeout: 1_000,
    });
  }).toPass({ timeout: 20_000 });
  await expect(page.locator("[data-badge-state]")).toHaveCount(0);

  // Publish the value; the next check passes.
  publishTxt(domain, value);
  await proofs.getByRole("button", { name: "Check now" }).click();
  const badge = page
    .locator('[data-badge-state="current"]')
    .filter({ hasText: `Controls ${domain}` });
  await expect(async () => {
    await page.reload();
    await expect(badge).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(badge.getByText("Domain or account controlled")).toBeVisible();
  await expect(badge.getByText(/does not show legal ownership, legal identity/)).toBeVisible();

  // The public page, signed out.
  const visitor = await page
    .context()
    .browser()!
    .newContext({ storageState: { cookies: [], origins: [] } });
  const pub = await visitor.newPage();
  const response = await pub.goto(`/p/${handle}`);
  expect(response?.status()).toBe(200);
  await expect(pub.getByRole("heading", { name: "Night Owl", level: 1 })).toBeVisible();
  await expect(
    pub.getByText(/This is a pseudonym. OriginOS has not checked a legal identity/),
  ).toBeVisible();
  await expect(
    pub.locator('[data-badge-state="current"]').filter({ hasText: `Controls ${domain}` }),
  ).toBeVisible();
  const html = await pub.content();
  for (const leak of [legalName, email, "Night Press", "prf_", "sub_"])
    expect(html).not.toContain(leak);

  // Withdrawing it: the public page moves it under "No longer current", labeled revoked.
  await proofs.getByRole("button", { name: "Withdraw" }).click();
  await proofs.getByRole("button", { name: "Confirm withdraw" }).click();
  await expect(proofs.getByText("revoked", { exact: true })).toBeVisible();
  await pub.reload();
  const lapsed = pub.getByRole("region", { name: "No longer current" });
  await expect(lapsed.locator('[data-badge-state="revoked"]')).toContainText(
    "Withdrawn by the profile's owner",
  );
  await expect(
    pub.getByText("This profile has no checked facts yet.", { exact: false }),
  ).toBeVisible();
  await visitor.close();
});

test("a member proves an account through the provider and asks for a claim review; the owner decides and the decision is shown", async ({
  page,
  browser,
}) => {
  await signUpAndVerify(page, "Olga Owner", uniqueEmail("owner"));
  await createOrganization(page, "Review Desk");
  const member = await addMember(page, browser, "Milo Member", "Review Desk");
  const m = member.page;
  const handle = `milo-${suffix()}`;
  await createProfile(m, handle, "Milo Writes", false);

  // Account proof: no permissions requested, no token kept.
  await m
    .getByRole("button", { name: "Prove a Test provider (local testing only) account" })
    .click();
  await expect(m).toHaveURL(new RegExp(`^${E2E.fakeProviderUrl}/oauth/authorize`));
  await expect(m.getByText(/OriginOS is asking for: no scopes/)).toBeVisible();
  await m.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(m).toHaveURL(/\/trust\/profiles\/prf_[^?]+\?proved=test-provider$/);
  await expect(
    m.getByText("Your Test provider (local testing only) account is proved."),
  ).toBeVisible();
  await expect(
    m.locator('[data-badge-state="current"]').filter({ hasText: "account test-user" }),
  ).toBeVisible();
  expect(await m.content()).not.toContain(E2E.fakeTokenPrefix);

  // A claim for review; the member cannot decide it.
  await m.locator("#claim-statement").fill("Columnist at The Example Times");
  await m.getByLabel("Evidence link").fill("https://times.example.com/columnists");
  await m.getByRole("button", { name: "Send for review" }).click();
  await expect(m.getByText("Sent for review.")).toBeVisible();
  await m.goto("/trust/reviews");
  const mine = m
    .getByRole("list", { name: "Review requests" })
    .locator('[data-review-status="pending"]');
  await expect(mine).toContainText("Claim: Columnist at The Example Times");
  await expect(mine.getByRole("button", { name: "Approve" })).toHaveCount(0);

  // The owner decides, with a reason.
  await page.goto("/trust");
  await page.getByRole("link", { name: "Review queue" }).click();
  const item = page
    .getByRole("list", { name: "Review requests" })
    .locator('[data-review-status="pending"]')
    .filter({ hasText: "Columnist at The Example Times" });
  await expect(item).toContainText("Requested by Milo Member");
  await expect(item).toContainText("Link (not opened by OriginOS)");
  await item.getByLabel("Reason for your decision").fill("Listed on the columnists page");
  await item.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Decision recorded.")).toBeVisible();
  await page.getByRole("link", { name: "Decided" }).click();
  await expect(
    page
      .locator('[data-review-status="approved"]')
      .filter({ hasText: "Columnist at The Example Times" }),
  ).toContainText("Decided by Olga Owner");

  // The public page shows the reviewed claim, without naming the organization or the evidence.
  const pub = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const visitor = await pub.newPage();
  await visitor.goto(`/p/${handle}`);
  const reviewed = visitor
    .locator('[data-badge-state="current"]')
    .filter({ hasText: "Affiliation" });
  await expect(reviewed).toBeVisible();
  await expect(reviewed.getByText("Identity reviewed")).toBeVisible();
  await expect(reviewed.getByText(/OriginOS did not check the claim itself/)).toBeVisible();
  const html = await visitor.content();
  expect(html).not.toContain("Review Desk");
  expect(html).not.toContain("times.example.com/columnists");
  await pub.close();
  await member.context.close();
});

test("a hidden profile has no public page", async ({ page }) => {
  await signUpAndVerify(page, "Hana Hidden", uniqueEmail("hidden"));
  await createOrganization(page, "Quiet Co");
  const handle = `quiet-${suffix()}`;
  await createProfile(page, handle, "Quiet Voice", false);
  expect((await page.request.get(`/p/${handle}`)).status()).toBe(200);
  await page.locator("#moderation-state").selectOption("hidden");
  await page.locator("#moderation-reason").fill("Reported, under review");
  await page.getByRole("button", { name: "Save moderation state" }).click();
  await expect(page.getByText("Moderation note: Reported, under review")).toBeVisible();
  expect((await page.request.get(`/p/${handle}`)).status()).toBe(404);
});
