import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./env";
import { createOrganization, signUpAndVerify } from "./support/accounts";
import { firstLink, uniqueEmail, waitForMail } from "./support/mail";

// Phase 07: uploads through the real UI, API, object storage (SeaweedFS),
// worker and malware scanner (ClamAV). Each test makes its own organization.
test.use({ storageState: { cookies: [], origins: [] } });

// The standard antivirus test string: harmless, and every scanner flags it.
const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

async function newOwner(page: Page, org: string) {
  await signUpAndVerify(page, "Fia Files", uniqueEmail("files"));
  await createOrganization(page, org);
  await page.goto("/settings");
  await page.getByRole("link", { name: "Files" }).click();
  await expect(page).toHaveURL(/\/settings\/files$/);
}

async function upload(page: Page, name: string, mimeType: string, content: string | Buffer) {
  await page.getByLabel(/^File/).setInputFiles({
    name,
    mimeType,
    buffer: typeof content === "string" ? Buffer.from(content) : content,
  });
  await page.getByRole("button", { name: "Upload" }).click();
}

const row = (page: Page, name: string) =>
  page
    .getByRole("region", { name: "Files in this organization" })
    .getByRole("row", { name: new RegExp(name) });

const alertWith = (page: Page, text: string) => page.getByRole("alert").filter({ hasText: text });

test("a clean file is checked, scanned, then previewed and downloaded", async ({ page }) => {
  await newOwner(page, "Clean Files Co");
  await upload(page, "field-notes.txt", "text/plain", "Observed 12 samples.\n<b>not html</b>");
  await expect(page.getByText("field-notes.txt uploaded.")).toBeVisible();
  const file = row(page, "field-notes.txt");
  // The page refreshes itself while the scan runs.
  await expect(file.getByText("clean", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(file.getByText(/Scanned by ClamAV/)).toBeVisible();

  await file.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("heading", { name: "Preview: field-notes.txt" })).toBeVisible();
  // Shown as text: the markup is visible, not rendered.
  await expect(page.locator("pre")).toContainText("<b>not html</b>");
  await expect(page.locator("pre b")).toHaveCount(0);

  const download = page.waitForEvent("download");
  await file.getByRole("button", { name: "Download" }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe("field-notes.txt");

  await page.goto("/settings/jobs");
  const jobs = page.getByRole("region", { name: "Background jobs" });
  await expect(jobs.getByRole("row", { name: /Check uploaded file.*succeeded/ })).toBeVisible();
});

test("refused and rejected uploads say why", async ({ page }) => {
  await newOwner(page, "Careful Files Co");

  // Contents that are not what the name and type claim: refused before storing.
  await upload(page, "photo.png", "image/png", "this is text, not an image");
  await expect(alertWith(page, "not a PNG image")).toBeVisible();

  // Not an accepted type.
  await upload(page, "page.html", "text/html", "<p>hello</p>");
  await expect(alertWith(page, "That file type is not accepted")).toBeVisible();

  // Too large (the E2E stack lowers the limit to 1 MB).
  await upload(page, "big.txt", "text/plain", Buffer.alloc(E2E.uploadMaxBytes + 1, "a"));
  await expect(alertWith(page, "the limit is 1.0 MB")).toBeVisible();

  // Malware: accepted for scanning, then rejected and kept in quarantine.
  await upload(page, "eicar.txt", "text/plain", EICAR);
  const file = row(page, "eicar.txt");
  await expect(file.getByText("rejected", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(file.getByText(/malware scanner flagged this file/)).toBeVisible();
  await expect(file.getByRole("button", { name: "Download" })).toHaveCount(0);
  await expect(file.getByText("Not available")).toBeVisible();
});

test("members can upload, but only owners and admins see background jobs", async ({
  page,
  browser,
}) => {
  await newOwner(page, "Team Files Co");
  const email = uniqueEmail("member");
  await page.goto("/settings");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible();
  const link = firstLink(await waitForMail(email, "invited you"));
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const member = await context.newPage();
  await signUpAndVerify(member, "Max Member", email);
  await member.goto(link);
  await member.getByRole("button", { name: "Join Team Files Co" }).click();
  await expect(member).toHaveURL(/\/home$/);

  await member.goto("/settings");
  await expect(member.getByRole("link", { name: "Background jobs" })).toHaveCount(0);
  await member.goto("/settings/files");
  await upload(member, "minutes.md", "text/markdown", "# Minutes\n");
  await expect(member.getByText("minutes.md uploaded.")).toBeVisible();
  await member.goto("/settings/jobs");
  await expect(member.getByText("Only owners and admins can see background jobs")).toBeVisible();
  await context.close();
});
