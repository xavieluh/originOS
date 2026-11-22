import { expect, type Page } from "@playwright/test";
import { E2E } from "../env";
import { firstLink, waitForMail } from "./mail";

/** Sign up through the UI and follow the verification link from the real email. Ends signed in. */
export async function signUpAndVerify(page: Page, name: string, email: string, from = "/sign-up") {
  await page.goto(from);
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/Check your email/)).toBeVisible();
  await page.goto(firstLink(await waitForMail(email, "Verify your email")));
}

export async function createOrganization(page: Page, name: string) {
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Organization name").fill(name);
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("button", { name: `Workspace: ${name}` })).toBeVisible();
}

export async function signIn(page: Page, email: string, password: string = E2E.password) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
