import { passkeyClient } from "@better-auth/passkey/client";
import { navigateAfterAuthChange } from "./navigate";
import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

/**
 * Browser client for Better Auth (ADR-022). It talks only to this app's own
 * /api/auth/* route, which forwards to the API, so the session cookie stays
 * first-party and httpOnly. Browser code never sees the session token.
 */
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        const next = new URLSearchParams(window.location.search).get("next");
        navigateAfterAuthChange(`/two-factor${next ? `?next=${encodeURIComponent(next)}` : ""}`);
      },
    }),
    passkeyClient(),
  ],
});

/** Better Auth error objects carry a message; fall back to something a person can act on. */
export function authErrorMessage(
  error: { message?: string | undefined; status?: number } | null | undefined,
): string {
  if (!error) return "Something went wrong. Try again.";
  if (error.status === 429) return "Too many attempts. Wait a minute and try again.";
  return error.message || "Something went wrong. Try again.";
}
