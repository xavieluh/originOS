import type { AccountProofProvider, ProfileDetail } from "@originos/contracts";
import { Badge, Button, ErrorState, PageHeader } from "@originos/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormMessage } from "../../../../../components/auth/auth-panel";
import {
  ClaimRequestForm,
  ModerationBadge,
  ModerationPanel,
  OwnershipRequestForm,
  ProfileSettings,
  ProofsPanel,
  ReviewList,
} from "../../../../../components/identity";
import { BadgeList } from "../../../../../components/identity-badges";
import { apiFetch } from "../../../../../lib/api";
import { requireWorkspace } from "../../../../../lib/session";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ proved?: string }>;
}) {
  await requireWorkspace();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [detail, providers] = await Promise.all([
    apiFetch<ProfileDetail>(`/v1/profiles/${encodeURIComponent(id)}`),
    apiFetch<AccountProofProvider[]>("/v1/identity/providers"),
  ]);
  if (!detail.ok) {
    if (detail.status === 404 || detail.status === 400) notFound();
    return <ErrorState title="Could not load this profile">{detail.message}</ErrorState>;
  }
  const { profile } = detail.data;
  const provedName =
    query.proved && providers.ok
      ? providers.data.find((p) => p.id === query.proved)?.name
      : undefined;
  const canEdit =
    profile.canManage && (profile.moderationState !== "suspended" || detail.data.canModerate);
  const publicUrl = `/p/${profile.handle}`;
  return (
    <>
      <PageHeader
        eyebrow={profile.kind === "organization" ? "Organization profile" : "Creator profile"}
        title={profile.displayName}
        description={`@${profile.handle}${profile.bio ? ` · ${profile.bio}` : ""}`}
      />
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <ModerationBadge state={profile.moderationState} />
          <Badge label={`visibility: ${profile.visibility}`} tone="neutral" />
          {profile.pseudonymous ? <Badge label="pseudonym" tone="info" /> : null}
          {profile.isMine ? <Badge label="your profile" tone="accent" /> : null}
          {profile.visibility === "public" && profile.moderationState === "active" ? (
            <Button action="identity.open-public" href={publicUrl} size="sm" variant="ghost">
              Open public page
            </Button>
          ) : null}
        </div>
        {profile.moderationReason ? (
          <FormMessage tone="info">Moderation note: {profile.moderationReason}</FormMessage>
        ) : null}
        {provedName ? (
          <FormMessage tone="info">Your {provedName} account is proved.</FormMessage>
        ) : null}
        <BadgeList
          badges={detail.data.badges}
          emptyText="No checked facts yet. Add a proof below; nothing counts until it passes."
        />
        <ProofsPanel detail={detail.data} providers={providers.ok ? providers.data : []} />
        {canEdit ? <ProfileSettings profile={profile} /> : null}
        {canEdit ? <ClaimRequestForm profileId={profile.id} /> : null}
        {!profile.canManage && profile.kind === "creator" ? (
          <OwnershipRequestForm profileId={profile.id} />
        ) : null}
        <section aria-labelledby="profile-reviews">
          <h2 id="profile-reviews" className="mb-3 font-display text-lg font-semibold">
            Review requests
          </h2>
          <ReviewList
            reviews={detail.data.reviews}
            showProfile={false}
            canRevoke={detail.data.canModerate}
            emptyTitle="No review requests"
            emptyText="Claims sent for review and ownership requests for this profile appear here."
          />
        </section>
        {detail.data.canModerate ? <ModerationPanel profile={profile} /> : null}
      </div>
    </>
  );
}
