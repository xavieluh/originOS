import type { Metadata } from "next";
import { ErrorState } from "@originos/ui";
import { AuthPanel, TextLink } from "../../../components/auth/auth-panel";
import { ResetPasswordForm } from "../../../components/auth/recovery-forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return (
    <AuthPanel
      title="Choose a new password"
      footer={<TextLink href="/sign-in">Back to sign in</TextLink>}
    >
      {token && !error ? (
        <ResetPasswordForm token={token} />
      ) : (
        <ErrorState title="This reset link is invalid or has expired">
          <TextLink href="/forgot-password">Ask for a new link</TextLink>.
        </ErrorState>
      )}
    </AuthPanel>
  );
}
