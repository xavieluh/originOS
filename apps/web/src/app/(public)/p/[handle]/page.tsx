import type { PublicProfileView } from "@originos/contracts";
import { Badge } from "@originos/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeList } from "../../../../components/identity-badges";
import { apiFetch } from "../../../../lib/api";

type Params = { readonly params: Promise<{ handle: string }> };

async function load(handle: string) {
  const result = await apiFetch<PublicProfileView>(
    `/v1/public/profiles/${encodeURIComponent(handle)}`,
  );
  if (!result.ok) {
    if (result.status === 404) notFound();
    throw new Error("The profile could not be loaded.");
  }
  return result.data;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const profile = await load((await params).handle);
  return {
    title: `${profile.displayName} (@${profile.handle})`,
    description: profile.bio ?? `${profile.displayName} on OriginOS.`,
    // The owner chooses whether search engines may index the page.
    robots: profile.discoverable ? { index: true, follow: false } : { index: false, follow: false },
  };
}

/** A creator or organization's public page: presentation and checked facts only. */
export default async function PublicProfilePage({ params }: Params) {
  const profile = await load((await params).handle);
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 sm:px-8">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-accent-text">
          {profile.kind === "organization" ? "Organization" : "Creator"} · @{profile.handle}
        </p>
        <h1 className="font-display text-4xl font-semibold">{profile.displayName}</h1>
        {profile.pseudonymous ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <Badge label="pseudonym" tone="info" />
            This is a pseudonym. OriginOS has not checked a legal identity and does not show one.
          </p>
        ) : null}
        {profile.bio ? <p className="text-lg text-fg-muted">{profile.bio}</p> : null}
      </header>
      <BadgeList
        badges={profile.badges}
        emptyText="This profile has no checked facts yet. Anything it says about itself is self-described."
      />
      <p className="text-sm text-fg-muted">
        Badges are checks made at a point in time. None of them is a trust score, proves who made a
        particular work, or shows legal ownership. Last updated {profile.updatedAt.slice(0, 10)}.
      </p>
    </article>
  );
}
