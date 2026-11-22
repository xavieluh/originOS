import type { Metadata } from "next";
import { AuthPanel, TextLink } from "../../../components/auth/auth-panel";
import { TwoFactorForm } from "../../../components/auth/recovery-forms";
import { safeNextPath } from "../../../lib/session-cookie";

export const metadata: Metadata = { title: "Two-step verification" };

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <AuthPanel
      title="Two-step verification"
      lead="Your account has two-step verification on. Enter a code to finish signing in."
      footer={<TextLink href="/sign-in">Start over</TextLink>}
    >
      <TwoFactorForm next={safeNextPath(next)} />
    </AuthPanel>
  );
}
