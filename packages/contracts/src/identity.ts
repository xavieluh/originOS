// IdentityMesh contracts (Phase 09, ADR-028): creator and organization
// profiles, ownership proofs (domain challenges and OAuth account proofs), the
// badges derived from them, and the human review queue.
//
// A badge states exactly what was checked, how and when. None of these shapes
// carries a person's account name, email or user id on the public side.

import { z } from "zod";
import { ProviderId } from "./connect.js";
import { ASSURANCE_LABELS, VISIBILITIES } from "./domain/vocabulary.js";

const iso = z.iso.datetime({ offset: true });
const idWith = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[0-9a-hjkmnp-tv-z]{26}$`));
export const ProfileId = idWith("prf");
export const ProofId = idWith("prv");
export const ReviewId = idWith("rvw");

/** creator: a person's profile (their human subject). organization: the organization's own profile. */
export const PROFILE_KINDS = ["creator", "organization"] as const;
export type ProfileKind = (typeof PROFILE_KINDS)[number];

/**
 * active: shown as its visibility allows.
 * hidden: kept, but never on the public network; members still see it, labeled.
 * suspended: hidden, and its owner can no longer edit it or add proofs.
 */
export const MODERATION_STATES = ["active", "hidden", "suspended"] as const;
export type ModerationState = (typeof MODERATION_STATES)[number];

/** Handles name public pages (/p/<handle>): 3 to 30 lowercase letters, digits and inner hyphens. */
export const Handle = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/,
    "3 to 30 lowercase letters, digits or hyphens, not starting or ending with a hyphen",
  )
  .refine((h) => !h.includes("--"), "no double hyphens");

/** Handles that would read as OriginOS itself, or collide with routes. */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  "admin",
  "administrator",
  "api",
  "app",
  "help",
  "login",
  "official",
  "origin",
  "originos",
  "root",
  "security",
  "staff",
  "support",
  "system",
  "verified",
  "www",
]);

const DisplayName = z.string().trim().min(1).max(80);
const Bio = z.string().trim().max(500);

export const ProfileCreate = z.object({
  kind: z.enum(PROFILE_KINDS),
  handle: Handle,
  displayName: DisplayName,
  bio: Bio.optional(),
  visibility: z.enum(VISIBILITIES).default("tenant"),
  /** The display name is a pseudonym: OriginOS shows no legal identity and says so on the page. */
  pseudonymous: z.boolean().default(false),
  /** Whether search engines may index the public page. */
  discoverable: z.boolean().default(true),
});
export type ProfileCreate = z.infer<typeof ProfileCreate>;

export const ProfileUpdate = z
  .object({
    handle: Handle,
    displayName: DisplayName,
    bio: Bio.nullable(),
    visibility: z.enum(VISIBILITIES),
    pseudonymous: z.boolean(),
    discoverable: z.boolean(),
  })
  .partial();
export type ProfileUpdate = z.infer<typeof ProfileUpdate>;

export const ModerationInput = z.object({
  state: z.enum(MODERATION_STATES),
  reason: z.string().trim().min(3).max(500),
});
export type ModerationInput = z.infer<typeof ModerationInput>;

// --- Proofs -------------------------------------------------------------------

export const PROOF_KINDS = ["domain", "account"] as const;
export type ProofKind = (typeof PROOF_KINDS)[number];

/**
 * dns_txt: a TXT record at _originos-challenge.<domain>.
 * html_file: a file at https://<domain>/.well-known/originos-verify.txt.
 * oauth: the person signed in to the provider account and authorized OriginOS (PKCE).
 */
export const PROOF_METHODS = ["dns_txt", "html_file", "oauth"] as const;
export type ProofMethod = (typeof PROOF_METHODS)[number];

/**
 * pending: a challenge was issued and has not passed yet.
 * verified: the challenge passed (see expiresAt; past it the badge reads "expired").
 * stale: it passed before, but a later re-check failed or another profile proved
 *   the same domain or account since; control may have changed.
 * revoked: withdrawn by the owner, ended by an ownership change, or revoked by a reviewer.
 */
export const PROOF_STATUSES = ["pending", "verified", "stale", "revoked"] as const;
export type ProofStatus = (typeof PROOF_STATUSES)[number];

export const PROOF_REVOKE_REASONS = ["withdrawn", "ownership_changed", "reviewer"] as const;
export type ProofRevokeReason = (typeof PROOF_REVOKE_REASONS)[number];

/** How long a passed check backs a badge before it must be checked again. */
export const PROOF_VALIDITY_DAYS: Readonly<Record<ProofKind, number>> = {
  domain: 90,
  account: 365,
};
/** Reviewed claims are looked at again after a year. */
export const REVIEW_VALIDITY_DAYS = 365;

/** Proof visibility: on the public profile, or only inside the organization. */
export const PROOF_VISIBILITIES = ["public", "tenant"] as const;

export const DomainProofStart = z.object({
  domain: z.string().trim().min(3).max(253),
  method: z.enum(["dns_txt", "html_file"]),
  visibility: z.enum(PROOF_VISIBILITIES).default("public"),
});
export type DomainProofStart = z.infer<typeof DomainProofStart>;

export const ProofVisibilityUpdate = z.object({ visibility: z.enum(PROOF_VISIBILITIES) });

/** What the person must publish to pass a domain challenge. */
export const ChallengeInstructions = z.object({
  method: z.enum(["dns_txt", "html_file"]),
  /** dns_txt: the record name. html_file: the URL OriginOS fetches. */
  location: z.string(),
  /** The exact value: the TXT record's text, or the file's whole content. */
  value: z.string(),
});
export type ChallengeInstructions = z.infer<typeof ChallengeInstructions>;

export const ProofView = z.object({
  id: ProofId,
  profileId: ProfileId,
  kind: z.enum(PROOF_KINDS),
  method: z.enum(PROOF_METHODS),
  /** Domain name, or the provider account's login. */
  label: z.string(),
  provider: ProviderId.nullable(),
  status: z.enum(PROOF_STATUSES),
  visibility: z.enum(PROOF_VISIBILITIES),
  instructions: ChallengeInstructions.nullable(),
  firstVerifiedAt: iso.nullable(),
  lastVerifiedAt: iso.nullable(),
  expiresAt: iso.nullable(),
  lastCheckedAt: iso.nullable(),
  lastCheckError: z.string().nullable(),
  staleReason: z.string().nullable(),
  revokedAt: iso.nullable(),
  revokedReason: z.enum(PROOF_REVOKE_REASONS).nullable(),
  createdAt: iso,
});
export type ProofView = z.infer<typeof ProofView>;

// --- Badges -----------------------------------------------------------------

/** current: backs the label now. expired: not re-checked in time. stale and revoked: see ProofStatus. */
export const BADGE_STATES = ["current", "expired", "stale", "revoked"] as const;
export type BadgeState = (typeof BADGE_STATES)[number];

/**
 * A badge is derived, never stored: one per verified, stale or revoked proof
 * and per approved review. Its wording is fixed by code, not by the person.
 */
export const BadgeView = z.object({
  id: z.string(),
  source: z.enum(["proof", "review"]),
  assurance: z.enum(ASSURANCE_LABELS),
  /** e.g. "Controls example.com". */
  label: z.string(),
  /** How it was checked, in plain words. */
  method: z.string(),
  checkedAt: iso,
  expiresAt: iso.nullable(),
  state: z.enum(BADGE_STATES),
  /** Why it is not current, when it is not. */
  stateNote: z.string().nullable(),
  /** What the badge does not show. Always present. */
  limitations: z.string(),
});
export type BadgeView = z.infer<typeof BadgeView>;

// --- Profiles -----------------------------------------------------------------

export const ProfileView = z.object({
  id: ProfileId,
  kind: z.enum(PROFILE_KINDS),
  handle: z.string(),
  displayName: z.string(),
  bio: z.string().nullable(),
  visibility: z.enum(VISIBILITIES),
  pseudonymous: z.boolean(),
  discoverable: z.boolean(),
  moderationState: z.enum(MODERATION_STATES),
  moderationReason: z.string().nullable(),
  /** The person can edit it and add proofs. */
  canManage: z.boolean(),
  /** Is this the signed-in person's own creator profile. */
  isMine: z.boolean(),
  createdAt: iso,
  updatedAt: iso,
});
export type ProfileView = z.infer<typeof ProfileView>;

/** The public projection. It never includes account names, emails, user or subject ids. */
export const PublicProfileView = z.object({
  handle: z.string(),
  kind: z.enum(PROFILE_KINDS),
  displayName: z.string(),
  bio: z.string().nullable(),
  pseudonymous: z.boolean(),
  discoverable: z.boolean(),
  badges: z.array(BadgeView),
  updatedAt: iso,
});
export type PublicProfileView = z.infer<typeof PublicProfileView>;

/** Providers usable for account proofs (no tokens are kept for these). */
export const AccountProofProvider = z.object({
  id: ProviderId,
  name: z.string(),
  testOnly: z.boolean(),
  configured: z.boolean(),
  setupHint: z.string().nullable(),
});
export type AccountProofProvider = z.infer<typeof AccountProofProvider>;

export const AccountProofCallback = z.object({
  provider: ProviderId,
  code: z.string().min(1).max(2048),
  state: z.string().min(1).max(256),
});
export type AccountProofCallback = z.infer<typeof AccountProofCallback>;

// --- Review queue -------------------------------------------------------------

/**
 * claim: a statement OriginOS cannot check by itself (an affiliation, a former
 *   name), decided by a reviewer who looks at the evidence.
 * ownership: the requester asks to become the profile's owner (account recovery
 *   after losing an account, or a handover). Approval moves the profile and ends
 *   the previous owner's proofs and reviewed claims.
 */
export const REVIEW_KINDS = ["claim", "ownership"] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];
export const REVIEW_STATUSES = ["pending", "approved", "rejected", "withdrawn", "revoked"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const CLAIM_TYPES = ["affiliation", "former_name", "other"] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];
export const OWNERSHIP_REASONS = ["recovery", "handover"] as const;

export const EvidenceItem = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("url"),
    url: z.url({ protocol: /^https?$/ }).max(2048),
    note: z.string().trim().max(300).optional(),
  }),
  z.object({ kind: z.literal("note"), note: z.string().trim().min(1).max(1000) }),
]);
export type EvidenceItem = z.infer<typeof EvidenceItem>;

export const ReviewRequest = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("claim"),
    claimType: z.enum(CLAIM_TYPES),
    statement: z.string().trim().min(3).max(300),
    evidence: z.array(EvidenceItem).min(1).max(10),
    visibility: z.enum(PROOF_VISIBILITIES).default("public"),
  }),
  z.object({
    kind: z.literal("ownership"),
    reason: z.enum(OWNERSHIP_REASONS),
    statement: z.string().trim().min(3).max(1000),
    evidence: z.array(EvidenceItem).max(10).default([]),
  }),
]);
export type ReviewRequest = z.infer<typeof ReviewRequest>;

export const ReviewDecisionInput = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().min(3).max(500),
});
export type ReviewDecisionInput = z.infer<typeof ReviewDecisionInput>;

export const ReviewRevokeInput = z.object({ reason: z.string().trim().min(3).max(500) });

/** Evidence the server computed, not supplied by the requester. */
export const MatchingProof = z.object({
  kind: z.enum(PROOF_KINDS),
  label: z.string(),
  /** The requester's own profile currently holds a verified proof of this domain or account. */
  requesterHolds: z.boolean(),
});

export const ReviewView = z.object({
  id: ReviewId,
  profileId: ProfileId,
  profileHandle: z.string(),
  profileDisplayName: z.string(),
  kind: z.enum(REVIEW_KINDS),
  status: z.enum(REVIEW_STATUSES),
  claimType: z.enum(CLAIM_TYPES).nullable(),
  ownershipReason: z.enum(OWNERSHIP_REASONS).nullable(),
  statement: z.string(),
  evidence: z.array(EvidenceItem),
  /** For ownership requests: proofs of the profile the requester also proves today. */
  matchingProofs: z.array(MatchingProof),
  /** SHA-256 over the statement and evidence as submitted; a decision records it. */
  evidenceHash: z.string(),
  visibility: z.enum(PROOF_VISIBILITIES),
  requestedBy: z.object({ userId: z.string().nullable(), name: z.string().nullable() }),
  isMine: z.boolean(),
  /** The signed-in person may decide it (owner or admin, and not the requester). */
  canDecide: z.boolean(),
  decidedBy: z.object({ userId: z.string().nullable(), name: z.string().nullable() }).nullable(),
  decidedAt: iso.nullable(),
  decisionReason: z.string().nullable(),
  revokedAt: iso.nullable(),
  revokedReason: z.string().nullable(),
  createdAt: iso,
});
export type ReviewView = z.infer<typeof ReviewView>;

export const ProfileDetail = z.object({
  profile: ProfileView,
  proofs: z.array(ProofView),
  badges: z.array(BadgeView),
  reviews: z.array(ReviewView),
  canModerate: z.boolean(),
});
export type ProfileDetail = z.infer<typeof ProfileDetail>;

/** Job types IdentityMesh enqueues (the worker runs them). */
export const IDENTITY_CHECK_DOMAIN_JOB = "identity.check_domain";

/** Prefix of the challenge value people publish. */
export const CHALLENGE_PREFIX = "originos-verify=";
export const DNS_CHALLENGE_LABEL = "_originos-challenge";
export const HTML_CHALLENGE_PATH = "/.well-known/originos-verify.txt";
