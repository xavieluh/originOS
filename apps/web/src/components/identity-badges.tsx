import type { BadgeState, BadgeView } from "@originos/contracts";
import { Badge, type BadgeTone } from "@originos/ui";

const STATE: Record<BadgeState, { label: string; tone: BadgeTone }> = {
  current: { label: "current", tone: "positive" },
  expired: { label: "expired", tone: "warning" },
  stale: { label: "stale", tone: "warning" },
  revoked: { label: "revoked", tone: "negative" },
};

/** Assurance labels in the words MASTER_SPEC §3 uses. */
export const ASSURANCE_TEXT: Record<BadgeView["assurance"], string> = {
  identity_reviewed: "Identity reviewed",
  domain_or_account_controlled: "Domain or account controlled",
  signed_provenance_validated: "Signed provenance validated",
  creator_declared_ai_use: "Creator-declared AI use",
  agent_action_observed: "Agent action observed",
  outcome_confirmed: "Outcome confirmed",
  research_claim_assessed: "Research claim assessed",
};

const day = (iso: string) => iso.slice(0, 10);

function BadgeItem({ badge }: { readonly badge: BadgeView }) {
  const s = STATE[badge.state];
  return (
    <li
      className="flex flex-col gap-1.5 rounded-md border border-border bg-surface p-4"
      data-badge-state={badge.state}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{badge.label}</span>
        <Badge label={s.label} tone={s.tone} />
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
        {ASSURANCE_TEXT[badge.assurance]}
      </p>
      {badge.stateNote ? <p className="text-sm text-fg">{badge.stateNote}</p> : null}
      <p className="text-sm text-fg-muted">{badge.method}</p>
      {badge.expiresAt && badge.state === "current" ? (
        <p className="text-xs text-fg-muted">
          Valid until {day(badge.expiresAt)} unless re-checked.
        </p>
      ) : null}
      <p className="text-sm text-fg-muted">
        <span className="font-medium text-fg">What this does not show: </span>
        {badge.limitations}
      </p>
    </li>
  );
}

/**
 * Current badges, then lapsed ones (expired, stale, revoked) under their own
 * heading, so a lapsed proof can never be read as a current one.
 */
export function BadgeList({
  badges,
  headingLevel = 2,
  emptyText,
}: {
  readonly badges: readonly BadgeView[];
  readonly headingLevel?: 2 | 3;
  readonly emptyText: string;
}) {
  const current = badges.filter((b) => b.state === "current");
  const lapsed = badges.filter((b) => b.state !== "current");
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="badges-current">
        <H id="badges-current" className="mb-3 font-display text-lg font-semibold">
          Current badges
        </H>
        {current.length === 0 ? (
          <p className="text-sm text-fg-muted">{emptyText}</p>
        ) : (
          <ul className="grid gap-3">
            {current.map((b) => (
              <BadgeItem key={b.id} badge={b} />
            ))}
          </ul>
        )}
      </section>
      {lapsed.length > 0 ? (
        <section aria-labelledby="badges-lapsed">
          <H id="badges-lapsed" className="mb-1 font-display text-lg font-semibold">
            No longer current
          </H>
          <p className="mb-3 text-sm text-fg-muted">
            These were checked once but do not back the profile now. Each says why.
          </p>
          <ul className="grid gap-3">
            {lapsed.map((b) => (
              <BadgeItem key={b.id} badge={b} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
