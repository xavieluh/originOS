import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E } from "./env";
import { createOrganization, signIn, signUpAndVerify } from "./support/accounts";
import { firstLink, uniqueEmail, waitForMail } from "./support/mail";
import { totp } from "./support/totp";

// Every test here starts signed out and creates its own people through the real flows.
test.use({ storageState: { cookies: [], origins: [] } });

async function newPerson(browser: Browser) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return { context, page: await context.newPage() };
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: /^Account:/ }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
}

async function invite(page: Page, email: string, role: "Member" | "Admin" = "Member") {
  await page.goto("/settings");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Role", { exact: true }).selectOption({ label: role });
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible();
  return firstLink(await waitForMail(email, "invited you"));
}

test.describe("signed-out access", () => {
  test("private pages redirect to sign-in and return to the page afterwards", async ({ page }) => {
    for (const path of ["/home", "/settings", "/settings/account", "/developers", "/onboarding"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(`/sign-in?next=${encodeURIComponent(path)}`);
    }
    const email = uniqueEmail("returner");
    await signUpAndVerify(page, "Returner", email);
    await createOrganization(page, "Return Co");
    await signOut(page);
    await page.goto("/settings/account");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(E2E.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/account$/);
  });

  test("a forged session cookie is rejected server-side", async ({ page, context }) => {
    await context.addCookies([
      { name: "originos.session_token", value: "forged.value", url: E2E.webUrl },
    ]);
    await page.goto("/home");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fhome$/);
  });

  test("private API endpoints answer 401 without a session", async ({ request }) => {
    for (const path of [
      "/v1/me",
      "/v1/organization",
      "/v1/organization/invitations",
      "/v1/organization/audit-events",
    ]) {
      const response = await request.get(`${E2E.apiUrl}${path}`);
      expect(response.status(), path).toBe(401);
    }
    const session = await request.get("/api/auth/get-session");
    expect(await session.json()).toBeNull();
  });

  test("sign-in refuses wrong passwords and off-site redirects", async ({ page }) => {
    const email = uniqueEmail("careful");
    await signUpAndVerify(page, "Careful", email);
    await createOrganization(page, "Careful Co");
    await signOut(page);
    await signIn(page, email, "not the password at all");
    await expect(page.getByText("That email and password don't match an account.")).toBeVisible();
    await page.goto("/sign-in?next=//evil.example/steal");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(E2E.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(`${E2E.webUrl}/home`);
  });

  test("an unverified account cannot sign in", async ({ page }) => {
    const email = uniqueEmail("unverified");
    await page.goto("/sign-up");
    await page.getByLabel("Your name").fill("Unverified");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(E2E.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(/Check your email/)).toBeVisible();
    await signIn(page, email);
    await expect(page.getByText(/Verify your email address before signing in/)).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in$/);
  });
});

test.describe("organizations and invitations", () => {
  test("invite, accept by email, switch workspaces, manage roles and remove", async ({
    page,
    browser,
  }) => {
    const ownerEmail = uniqueEmail("owner");
    await signUpAndVerify(page, "Olu Owner", ownerEmail);
    await createOrganization(page, "Orbit Lab");

    const inviteeEmail = uniqueEmail("invitee");
    const link = await invite(page, inviteeEmail);
    expect(link).toMatch(/\/invitations\/accept#token=/);

    // The invitee has no account yet: the invitation survives sign-up and verification.
    const invitee = await newPerson(browser);
    await invitee.page.goto(link);
    await expect(invitee.page).toHaveURL(/\/invitations\/accept$/); // token removed from the address bar
    await invitee.page.getByRole("link", { name: "Create an account" }).click();
    await signUpAndVerify(invitee.page, "Ines Invitee", inviteeEmail, invitee.page.url());
    await expect(invitee.page).toHaveURL(/\/invitations\/accept$/);
    await expect(invitee.page.getByText(/invited to join Orbit Lab as a member/)).toBeVisible();
    await invitee.page.getByRole("button", { name: "Join Orbit Lab" }).click();
    await expect(invitee.page).toHaveURL(/\/home$/);
    await expect(invitee.page.getByRole("button", { name: "Workspace: Orbit Lab" })).toBeVisible();

    // A plain member sees the roster but no management controls.
    await invitee.page.goto("/settings");
    await expect(invitee.page.getByText("Olu Owner")).toBeVisible();
    await expect(invitee.page.getByRole("button", { name: "Send invitation" })).toHaveCount(0);
    await expect(invitee.page.getByRole("heading", { name: "Activity" })).toHaveCount(0);

    // The invitee creates their own organization and switches between both.
    await invitee.page.goto("/onboarding?new=1");
    await createOrganization(invitee.page, "Ines Studio");
    await invitee.page.getByRole("button", { name: "Workspace: Ines Studio" }).click();
    await invitee.page.getByRole("button", { name: /Orbit Lab/ }).click();
    await expect(invitee.page.getByRole("button", { name: "Workspace: Orbit Lab" })).toBeVisible();

    // The used link cannot be used again.
    await invitee.page.goto(link);
    await expect(invitee.page.getByText("This invitation has already been used")).toBeVisible();

    // The owner promotes, then removes, the invitee; the audit log records each step.
    await page.goto("/settings");
    await page.getByLabel("Role for Ines Invitee").selectOption("admin");
    await expect(page.getByText("Ines Invitee is now admin.")).toBeVisible();
    await page
      .getByRole("region", { name: "Members of this organization" })
      .getByRole("row", { name: /Ines Invitee/ })
      .getByRole("button", { name: "Remove" })
      .click();
    await page.getByRole("button", { name: "Confirm remove" }).click();
    await expect(page.getByText("Ines Invitee was removed.")).toBeVisible();
    const activity = page.getByRole("region", { name: "Organization activity" });
    for (const event of [
      "Removed a member",
      "Changed a member's role",
      "Joined",
      "Sent an invitation",
      "Created the organization",
    ]) {
      await expect(activity.getByText(event, { exact: true })).toBeVisible();
    }

    // Removal takes effect immediately: Orbit Lab is gone from the invitee's workspaces.
    await invitee.page.goto("/home");
    await expect(invitee.page).toHaveURL(/\/onboarding$/);
    await expect(invitee.page.getByText("Orbit Lab")).toHaveCount(0);
    await expect(invitee.page.getByText("Ines Studio")).toBeVisible();
    await invitee.context.close();
  });

  test("a revoked invitation cannot be accepted, and an invitation only works for its own email", async ({
    page,
    browser,
  }) => {
    await signUpAndVerify(page, "Rita Revoker", uniqueEmail("revoker"));
    await createOrganization(page, "Revoke Co");
    const intended = uniqueEmail("intended");
    const link = await invite(page, intended);
    await page
      .getByRole("region", { name: "Invitations" })
      .getByRole("row", { name: new RegExp(intended) })
      .getByRole("button", { name: "Revoke" })
      .click();
    await page.getByRole("button", { name: "Confirm revoke" }).click();
    await expect(
      page
        .getByRole("region", { name: "Invitations" })
        .getByRole("row", { name: new RegExp(intended) }),
    ).toContainText("revoked");

    const other = await newPerson(browser);
    await signUpAndVerify(other.page, "Otto Other", uniqueEmail("other"));
    await createOrganization(other.page, "Otto Co");
    await other.page.goto(link);
    await expect(other.page.getByText("This invitation was withdrawn")).toBeVisible();

    const second = await invite(page, intended);
    await other.page.goto(second);
    await expect(
      other.page.getByText("This invitation is for a different email address"),
    ).toBeVisible();
    await expect(other.page.getByRole("button", { name: /^Join/ })).toHaveCount(0);
    await other.context.close();
  });

  test("ownership can be transferred to a member", async ({ page, browser }) => {
    await signUpAndVerify(page, "Tara Transfer", uniqueEmail("transfer"));
    await createOrganization(page, "Handover Co");
    const nextEmail = uniqueEmail("heir");
    const link = await invite(page, nextEmail, "Admin");
    const heir = await newPerson(browser);
    await heir.page.goto(link);
    await heir.page.getByRole("link", { name: "Create an account" }).click();
    await signUpAndVerify(heir.page, "Hal Heir", nextEmail, heir.page.url());
    await heir.page.getByRole("button", { name: "Join Handover Co" }).click();
    await expect(heir.page).toHaveURL(/\/home$/);

    await page.goto("/settings");
    await page.getByRole("button", { name: "Make owner" }).click();
    await page.getByRole("button", { name: "Transfer to Hal Heir" }).click();
    await expect(page.getByText("Hal Heir is now the owner. You are an admin.")).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Members of this organization" })
        .getByRole("row", { name: /Hal Heir/ }),
    ).toContainText("owner");
    await heir.context.close();
  });
});

test.describe("account security", () => {
  test("password reset by email signs in with the new password only", async ({ page }) => {
    const email = uniqueEmail("forgetful");
    await signUpAndVerify(page, "Forgetful", email);
    await createOrganization(page, "Forget Co");
    await signOut(page);
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Email me a reset link" }).click();
    await expect(page.getByText(/If an account uses that address/)).toBeVisible();
    await page.goto(firstLink(await waitForMail(email, "Reset your")));
    await expect(page).toHaveURL(/\/reset-password\?token=/);
    const fresh = "a brand new passphrase 42";
    await page.getByLabel(/^New password/).fill(fresh);
    await page.getByLabel("Confirm new password").fill(fresh);
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.getByText("Your password was changed.")).toBeVisible();
    await signIn(page, email);
    await expect(page.getByText("That email and password don't match an account.")).toBeVisible();
    await signIn(page, email, fresh);
    await expect(page).toHaveURL(/\/home$/);
  });

  test("two-step verification with an authenticator app and a backup code", async ({ page }) => {
    const email = uniqueEmail("twofactor");
    await signUpAndVerify(page, "Tess Totp", email);
    await createOrganization(page, "Totp Co");
    await page.goto("/settings/account");
    await page.getByLabel("Confirm with your password").fill(E2E.password);
    await page.getByRole("button", { name: "Set up" }).click();
    const secret = (await page.getByTestId("totp-secret").innerText()).trim();
    const backup = (
      await page.getByTestId("backup-codes").locator("li").first().innerText()
    ).trim();
    await page.getByLabel("Code from your app").fill(totp(secret));
    await page.getByRole("button", { name: "Turn on" }).click();
    await expect(page.getByText("Two-step verification is on.")).toBeVisible();

    await signOut(page);
    await signIn(page, email);
    await expect(page).toHaveURL(/\/two-factor/);
    await page.getByLabel(/6-digit code/).fill("000000");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByText("That code didn't work. Check it and try again.")).toBeVisible();
    await page.getByLabel(/6-digit code/).fill(totp(secret));
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page).toHaveURL(/\/home$/);

    await signOut(page);
    await signIn(page, email);
    await page.getByRole("button", { name: "Use a backup code instead" }).click();
    await page.getByLabel("Backup code").fill(backup);
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page).toHaveURL(/\/home$/);
  });

  test("passkeys can be added and used to sign in", async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
    await signUpAndVerify(page, "Pat Passkey", uniqueEmail("passkey"));
    await createOrganization(page, "Passkey Co");
    await page.goto("/settings/account");
    await page.getByRole("button", { name: "Add a passkey" }).click();
    await expect(page.getByText("Passkey added.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Your passkeys" }).getByRole("row")).toHaveCount(
      2,
    );

    await signOut(page);
    await page.getByRole("button", { name: "Sign in with a passkey" }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("button", { name: "Workspace: Passkey Co" })).toBeVisible();
  });

  test("other sessions can be signed out from account settings", async ({ page, browser }) => {
    const email = uniqueEmail("sessions");
    await signUpAndVerify(page, "Sam Sessions", email);
    await createOrganization(page, "Session Co");
    const laptop = await newPerson(browser);
    await signIn(laptop.page, email);
    await expect(laptop.page).toHaveURL(/\/home$/);

    await page.goto("/settings/account");
    const sessions = page.getByRole("region", { name: "Your sessions" });
    await expect(sessions.getByRole("row")).toHaveCount(3);
    await page.getByRole("button", { name: "Sign out other sessions" }).click();
    await expect(page.getByText("All other sessions signed out.")).toBeVisible();
    await expect(sessions.getByRole("row")).toHaveCount(2);

    await laptop.page.goto("/settings");
    await expect(laptop.page).toHaveURL(/\/sign-in/);
    await laptop.context.close();
  });
});
