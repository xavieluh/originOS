import type { Metadata } from "next";
import { ErrorState } from "@originos/ui";
import { AuthPanel, TextLink } from "../../../components/auth/auth-panel";
import { ForgotPasswordForm } from "../../../components/auth/recovery-forms";
import { AccountsUnavailable } from "../../../components/auth/unavailable";
import { getAuthConfig } from "../../../lib/auth-config";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage() {
  const config = await getAuthConfig();
  return (
    <AuthPanel
      title="Reset your password"
      lead="Enter your account's email address and we'll send you a link to choose a new password."
      footer={<TextLink href="/sign-in">Back to sign in</TextLink>}
    >
      {config.accounts !== "available" ? (
        <AccountsUnavailable config={config} />
      ) : config.emailDelivery !== "configured" ? (
        <ErrorState title="Email delivery is not set up">
          Password reset needs email, and this deployment cannot send it yet.
        </ErrorState>
      ) : (
        <ForgotPasswordForm />
      )}
    </AuthPanel>
  );
}
