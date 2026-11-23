import type { ProfileView } from "@originos/contracts";
import { Badge, DataTable, ErrorState, PageHeader } from "@originos/ui";
import type { Metadata } from "next";
import { FormMessage } from "../../../../components/auth/auth-panel";
import { CreateProfileForm, ModerationBadge } from "../../../../components/identity";
import { apiFetch } from "../../../../lib/api";
import { requireWorkspace } from "../../../../lib/session";

export const metadata: Metadata = { title: "Profiles" };

/** Outcomes the account-proof callback reports. Only known codes are shown; nothing from the URL is echoed. */
const OUTCOMES: Record<string, string> = {
  denied: "The account was not approved at the provider. Nothing was proved.",
  state_used: "That attempt was already used. Start the account proof again.",
  state_expired: "That attempt expired. Start the account proof again.",
  invalid_state:
    "That attempt is not valid here: it was started by someone else, for something else, or in another organization.",
  provider_rejected_code: "The provider did not accept the authorization. Try again.",
  provider_error: "The provider could not confirm the account. Try again.",
  provider_not_configured: "That provider is not set up for this deployment.",
  profile_suspended: "This profile is suspended.",
  forbidden: "You can prove accounts only on a profile you manage.",
  api_unreachable: "OriginOS did not answer while finishing the proof. Try again.",
};

export default async function ProfilesPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ error?: string }>;
}) {
  const { active } = await requireWorkspace();
  const query = await searchParams;
  const profiles = await apiFetch<ProfileView[]>("/v1/profiles");
  const isAdmin = active.role === "owner" || active.role === "admin";
  return (
    <>
      <PageHeader
        eyebrow="IdentityMesh"
        title="Profiles"
        description="Creator and organization profiles in this organization. Public ones have a page on the public network at /p/<handle>."
      />
      <div className="flex flex-col gap-6">
        {query.error ? (
          <FormMessage tone="error">
            {OUTCOMES[query.error] ?? "The account proof could not be completed. Try again."}
          </FormMessage>
        ) : null}
        {profiles.ok ? (
          <DataTable
            caption="Profiles in this organization"
            rowKey={(p) => p.id}
            rows={profiles.data}
            empty={<p className="text-sm text-fg-muted">No profiles yet. Create yours below.</p>}
            columns={[
              {
                key: "name",
                header: "Profile",
                cell: (p) => (
                  <div className="flex flex-col">
                    <a className="font-medium underline" href={`/trust/profiles/${p.id}`}>
                      {p.displayName}
                    </a>
                    <span className="text-xs text-fg-muted">
                      @{p.handle} · {p.kind === "organization" ? "organization" : "creator"}
                      {p.isMine ? " · yours" : ""}
                    </span>
                  </div>
                ),
              },
              {
                key: "visibility",
                header: "Visibility",
                cell: (p) => (
                  <span className="inline-flex flex-wrap gap-1">
                    <Badge label={p.visibility} tone="neutral" />
                    {p.pseudonymous ? <Badge label="pseudonym" tone="info" /> : null}
                  </span>
                ),
              },
              {
                key: "moderation",
                header: "State",
                cell: (p) => <ModerationBadge state={p.moderationState} />,
              },
            ]}
          />
        ) : (
          <ErrorState title="Could not load profiles">{profiles.message}</ErrorState>
        )}
        <CreateProfileForm canCreateOrganization={isAdmin} />
      </div>
    </>
  );
}
