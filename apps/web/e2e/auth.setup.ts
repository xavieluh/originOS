import { test as setup } from "@playwright/test";
import { E2E } from "./env";
import { createOrganization, signUpAndVerify } from "./support/accounts";
import { uniqueEmail } from "./support/mail";

/**
 * One real account and organization for the workspace suites, created through
 * the UI and the real email flow, saved as browser storage state.
 */
setup("create the workspace owner", async ({ page }) => {
  await signUpAndVerify(page, E2E.ownerName, uniqueEmail("owner"));
  await createOrganization(page, E2E.ownerOrganization);
  await page.context().storageState({ path: E2E.ownerState });
});
