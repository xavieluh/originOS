import { PageHeader } from "@originos/ui";
import type { Metadata } from "next";
import { AccountSettings } from "../../../../components/account-settings";
import { getAuthConfig } from "../../../../lib/auth-config";
import { requireMe } from "../../../../lib/session";

export const metadata: Metadata = { title: "Account and security" };

export default async function AccountPage() {
  const [me, config] = await Promise.all([requireMe(), getAuthConfig()]);
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Account and security"
        description="Your sign-in methods and sessions. These apply across every organization you belong to."
      />
      <AccountSettings me={me} passkeysAvailable={config.methods.includes("passkey")} />
    </>
  );
}
