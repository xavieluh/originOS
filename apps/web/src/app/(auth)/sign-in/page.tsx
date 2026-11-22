import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthPanel, FormMessage, TextLink } from "../../../components/auth/auth-panel";
import { SignInForm } from "../../../components/auth/sign-in-form";
import { AccountsUnavailable } from "../../../components/auth/unavailable";
import { getMe } from "../../../lib/api";
import { getAuthConfig } from "../../../lib/auth-config";
import { safeNextPath } from "../../../lib/session-cookie";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const config = await getAuthConfig();
  if (config.accounts === "available" && (await getMe())) redirect(next);
  const signUpHref = `/sign-up${params.next ? `?next=${encodeURIComponent(next)}` : ""}`;
  return (
    <AuthPanel
      title="Sign in to OriginOS"
      lead="Use the email address and password for your account, or a passkey you added."
      footer={
        <>
          New here? <TextLink href={signUpHref}>Create an account</TextLink>
        </>
      }
    >
      {config.accounts === "available" ? (
        <div className="flex flex-col gap-4">
          {params.reset === "1" ? (
            <FormMessage tone="info">
              Your password was changed. Sign in with the new one.
            </FormMessage>
          ) : null}
          <SignInForm next={next} passkeys={config.methods.includes("passkey")} />
        </div>
      ) : (
        <AccountsUnavailable config={config} />
      )}
    </AuthPanel>
  );
}
