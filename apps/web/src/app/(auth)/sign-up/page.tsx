import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthPanel, TextLink } from "../../../components/auth/auth-panel";
import { SignUpForm } from "../../../components/auth/sign-up-form";
import { AccountsUnavailable } from "../../../components/auth/unavailable";
import { ErrorState } from "@originos/ui";
import { getMe } from "../../../lib/api";
import { getAuthConfig } from "../../../lib/auth-config";
import { loadWebServerEnv } from "../../../lib/env";
import { safeNextPath } from "../../../lib/session-cookie";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const config = await getAuthConfig();
  if (config.accounts === "available" && (await getMe())) redirect(next);
  const env = loadWebServerEnv();
  const mailboxUrl = env.NODE_ENV !== "production" ? (env.ORIGINOS_DEV_MAILBOX_URL ?? null) : null;
  return (
    <AuthPanel
      title="Create your OriginOS account"
      lead="We'll email you a link to confirm the address before you can sign in."
      footer={
        <>
          Already have an account?{" "}
          <TextLink href={`/sign-in${params.next ? `?next=${encodeURIComponent(next)}` : ""}`}>
            Sign in
          </TextLink>
        </>
      }
    >
      {config.accounts !== "available" ? (
        <AccountsUnavailable config={config} />
      ) : config.emailDelivery !== "configured" ? (
        <ErrorState title="Email delivery is not set up">
          New accounts need a verified email address, and this deployment cannot send email yet. Set
          SMTP_URL for the API (see DEVELOPMENT.md).
        </ErrorState>
      ) : (
        <SignUpForm next={next} mailboxUrl={mailboxUrl} />
      )}
    </AuthPanel>
  );
}
