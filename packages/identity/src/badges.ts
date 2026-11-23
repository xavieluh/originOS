// Badges are derived from proofs and reviews at read time, with fixed wording:
// what was checked, how, when, until when, and what it does not show. They are
// never stored, so an expired badge cannot be shown as current by mistake.
import {
  type BadgeState,
  type BadgeView,
  type ClaimType,
  PROOF_VALIDITY_DAYS,
  type ProofKind,
  type ProofMethod,
  type ProofRevokeReason,
  type ProofStatus,
  REVIEW_VALIDITY_DAYS,
} from "@originos/contracts";

export interface ProofFacts {
  readonly id: string;
  readonly kind: ProofKind;
  readonly method: ProofMethod;
  readonly label: string;
  readonly provider: string | null;
  readonly status: ProofStatus;
  readonly lastVerifiedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly staleReason: string | null;
  readonly revokedAt: Date | null;
  readonly revokedReason: ProofRevokeReason | null;
}

export interface ReviewFacts {
  readonly id: string;
  readonly claimType: ClaimType | null;
  readonly statement: string;
  readonly status: string;
  readonly decidedAt: Date | null;
  readonly revokedAt: Date | null;
  /** Who reviewed, as shown publicly: always the organization, never a person. */
  readonly reviewerLabel: string;
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

const METHOD_TEXT: Record<ProofMethod, string> = {
  dns_txt: "A DNS TXT record with a one-time OriginOS value was found",
  html_file: "A file with a one-time OriginOS value was found on the website over HTTPS",
  oauth: "The account holder signed in to the provider and authorized OriginOS",
};

const REVOKE_TEXT: Record<ProofRevokeReason, string> = {
  withdrawn: "Withdrawn by the profile's owner",
  ownership_changed: "Ended when the profile changed owner",
  reviewer: "Revoked by a reviewer",
};

const CLAIM_TEXT: Record<ClaimType, string> = {
  affiliation: "Affiliation",
  former_name: "Former name",
  other: "Claim",
};

export function proofLabel(p: Pick<ProofFacts, "kind" | "label">, providerName?: string): string {
  return p.kind === "domain"
    ? `Controls ${p.label}`
    : `Controls the ${providerName ?? "provider"} account ${p.label}`;
}

function state(
  status: "current" | "stale" | "revoked",
  expiresAt: Date | null,
  now: Date,
): BadgeState {
  if (status !== "current") return status;
  return expiresAt && expiresAt <= now ? "expired" : "current";
}

/** The badge a proof backs, or null while it is still pending. */
export function proofBadge(p: ProofFacts, now: Date, providerName?: string): BadgeView | null {
  if (p.status === "pending" || !p.lastVerifiedAt) return null;
  const s = state(
    p.status === "verified" ? "current" : p.status === "stale" ? "stale" : "revoked",
    p.expiresAt,
    now,
  );
  const stateNote =
    s === "expired"
      ? `Not re-checked since ${day(p.lastVerifiedAt)}; it expired on ${day(p.expiresAt!)}.`
      : s === "stale"
        ? (p.staleReason ?? "A later check did not pass.")
        : s === "revoked"
          ? `${REVOKE_TEXT[p.revokedReason ?? "withdrawn"]} on ${day(p.revokedAt ?? now)}.`
          : null;
  const target = p.kind === "domain" ? p.label : `this ${providerName ?? "provider"} account`;
  return {
    id: p.id,
    source: "proof",
    assurance: "domain_or_account_controlled",
    label: proofLabel(p, providerName),
    method: `${METHOD_TEXT[p.method]} on ${day(p.lastVerifiedAt)}.`,
    checkedAt: p.lastVerifiedAt.toISOString(),
    expiresAt: p.expiresAt?.toISOString() ?? null,
    state: s,
    stateNote,
    limitations: `Shows that whoever runs this profile controlled ${target} when it was checked. It does not show legal ownership, legal identity, or who made any work.`,
  };
}

/** The badge an approved (or later revoked) claim review backs. */
export function reviewBadge(r: ReviewFacts, now: Date): BadgeView | null {
  if ((r.status !== "approved" && r.status !== "revoked") || !r.decidedAt || !r.claimType)
    return null;
  const expiresAt = addDays(r.decidedAt, REVIEW_VALIDITY_DAYS);
  const s = state(r.status === "revoked" ? "revoked" : "current", expiresAt, now);
  return {
    id: r.id,
    source: "review",
    assurance: "identity_reviewed",
    label: `${CLAIM_TEXT[r.claimType]}: ${r.statement}`,
    method: `A reviewer at ${r.reviewerLabel} looked at the evidence submitted with this claim and approved it on ${day(r.decidedAt)}.`,
    checkedAt: r.decidedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    state: s,
    stateNote:
      s === "expired"
        ? `Reviewed on ${day(r.decidedAt)}; reviews lapse after a year.`
        : s === "revoked"
          ? `Revoked by a reviewer on ${day(r.revokedAt ?? now)}.`
          : null,
    limitations:
      "A person reviewed submitted evidence; OriginOS did not check the claim itself. The reviewer belongs to the organization that hosts this profile, not to OriginOS.",
  };
}

export interface BadgeInput {
  readonly proofs: readonly ProofFacts[];
  readonly reviews: readonly ReviewFacts[];
  readonly providerNames?: Readonly<Record<string, string>>;
  readonly now?: Date;
}

/** Current badges first, then lapsed ones (expired, stale, revoked), newest check first within each. */
export function badgesFor(input: BadgeInput): BadgeView[] {
  const now = input.now ?? new Date();
  const out: BadgeView[] = [];
  for (const p of input.proofs) {
    const b = proofBadge(p, now, p.provider ? input.providerNames?.[p.provider] : undefined);
    if (b) out.push(b);
  }
  for (const r of input.reviews) {
    const b = reviewBadge(r, now);
    if (b) out.push(b);
  }
  const rank: Record<BadgeState, number> = { current: 0, expired: 1, stale: 2, revoked: 3 };
  return out.sort(
    (a, b) => rank[a.state] - rank[b.state] || b.checkedAt.localeCompare(a.checkedAt),
  );
}

/** When a check made now stops backing a badge. */
export const expiryFrom = (kind: ProofKind, at: Date) => addDays(at, PROOF_VALIDITY_DAYS[kind]);
