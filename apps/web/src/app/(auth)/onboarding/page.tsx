import type { Metadata } from "next";
import { AuthPanel } from "../../../components/auth/auth-panel";
import { CreateOrganizationForm, PickOrganization } from "../../../components/onboarding-forms";
import { requireMe } from "../../../lib/session";

export const metadata: Metadata = { title: "Choose a workspace" };

export default async function OnboardingPage() {
  const me = await requireMe();
  const hasOrgs = me.memberships.length > 0;
  return (
    <div className="flex flex-col gap-6">
      {hasOrgs ? (
        <AuthPanel
          title="Open a workspace"
          lead={`Signed in as ${me.user.email}. Pick one of your organizations.`}
        >
          <PickOrganization memberships={me.memberships} />
        </AuthPanel>
      ) : null}
      <AuthPanel
        title={hasOrgs ? "Or create a new organization" : "Create your organization"}
        lead={
          hasOrgs
            ? "You'll be its owner."
            : `Signed in as ${me.user.email}. Everything in OriginOS belongs to an organization. You'll be its owner. If someone invited you, open the link in their email instead.`
        }
      >
        <CreateOrganizationForm />
      </AuthPanel>
    </div>
  );
}
