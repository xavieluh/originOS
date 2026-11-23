// IdentityMesh (Phase 09, ADR-028): creator and organization profiles,
// ownership proofs and the human review queue, in the `trust` context.
//
// A profile presents a Subject. Proven facts are recorded as canonical
// trust.identity_claims rows (assurance label, capture method, limitations);
// these tables hold the lifecycle around them: challenges, re-checks, expiry,
// revocation, review decisions. Privileges and row-level security are in
// migration 0011; the database refuses a verified domain proof that did not
// come from the worker's challenge check.
import {
  CLAIM_TYPES,
  MODERATION_STATES,
  OWNERSHIP_REASONS,
  PROFILE_KINDS,
  PROOF_KINDS,
  PROOF_METHODS,
  PROOF_REVOKE_REASONS,
  PROOF_STATUSES,
  PROOF_VISIBILITIES,
  REVIEW_KINDS,
  REVIEW_STATUSES,
  VISIBILITIES,
  type EvidenceItem,
  newProfileId,
  newProofId,
  newReviewId,
} from "@originos/contracts";
import { sql, type SQL } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { identityClaims, subjects, trust } from "./domain-schema.js";
import { organizations, users } from "./schema.js";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const inList = (column: SQL | AnyPgColumn, values: readonly string[]) =>
  sql`${column} in (${sql.raw(values.map((v) => `'${v}'`).join(", "))})`;
const tenant = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });
const userRef = (name: string) => uuid(name).references(() => users.id, { onDelete: "set null" });

export const profiles = trust.table(
  "profiles",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newProfileId()),
    tenantId: tenant(),
    subjectId: text("subject_id").notNull(),
    kind: text("kind", { enum: PROFILE_KINDS }).notNull(),
    /** Global: public pages live at /p/<handle>. */
    handle: text("handle").notNull(),
    displayName: text("display_name").notNull(),
    bio: text("bio"),
    visibility: text("visibility", { enum: VISIBILITIES }).notNull().default("tenant"),
    pseudonymous: boolean("pseudonymous").notNull().default(false),
    discoverable: boolean("discoverable").notNull().default(true),
    moderationState: text("moderation_state", { enum: MODERATION_STATES })
      .notNull()
      .default("active"),
    moderationReason: text("moderation_reason"),
    moderatedAt: ts("moderated_at"),
    moderatedByUserId: userRef("moderated_by_user_id"),
    createdByUserId: userRef("created_by_user_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("profiles_id_ck", sql`${t.id} ~ '^prf_[0-9a-hjkmnp-tv-z]{26}$'`),
    check("profiles_kind_ck", inList(t.kind, PROFILE_KINDS)),
    check("profiles_visibility_ck", inList(t.visibility, VISIBILITIES)),
    check("profiles_moderation_ck", inList(t.moderationState, MODERATION_STATES)),
    check(
      "profiles_handle_ck",
      sql`${t.handle} ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$' and position('--' in ${t.handle}) = 0`,
    ),
    check(
      "profiles_text_ck",
      sql`char_length(${t.displayName}) between 1 and 80 and (${t.bio} is null or char_length(${t.bio}) <= 500)`,
    ),
    check(
      "profiles_moderation_reason_ck",
      sql`${t.moderationState} = 'active' or ${t.moderationReason} is not null`,
    ),
    unique("profiles_tenant_id_uq").on(t.tenantId, t.id),
    uniqueIndex("profiles_handle_uq").on(t.handle),
    index("profiles_subject_idx").on(t.tenantId, t.subjectId),
    uniqueIndex("profiles_one_org_profile_uq")
      .on(t.tenantId)
      .where(sql`${t.kind} = 'organization'`),
    foreignKey({
      name: "profiles_subject_fk",
      columns: [t.tenantId, t.subjectId],
      foreignColumns: [subjects.tenantId, subjects.id],
    }),
  ],
);

export const identityProofs = trust.table(
  "identity_proofs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newProofId()),
    tenantId: tenant(),
    profileId: text("profile_id").notNull(),
    kind: text("kind", { enum: PROOF_KINDS }).notNull(),
    method: text("method", { enum: PROOF_METHODS }).notNull(),
    /** Normalized domain, or "<provider>:<account id>". Compared across profiles. */
    target: text("target").notNull(),
    provider: text("provider"),
    /** Domain, or the account's login at the time of the proof. */
    label: text("label").notNull(),
    /** The challenge value for domain proofs. Not a secret: it only works with control of the domain. */
    challenge: text("challenge"),
    status: text("status", { enum: PROOF_STATUSES }).notNull().default("pending"),
    visibility: text("visibility", { enum: PROOF_VISIBILITIES }).notNull().default("public"),
    firstVerifiedAt: ts("first_verified_at"),
    lastVerifiedAt: ts("last_verified_at"),
    expiresAt: ts("expires_at"),
    lastCheckedAt: ts("last_checked_at"),
    lastCheckError: text("last_check_error"),
    checkCount: integer("check_count").notNull().default(0),
    staleReason: text("stale_reason"),
    staleAt: ts("stale_at"),
    revokedAt: ts("revoked_at"),
    revokedReason: text("revoked_reason", { enum: PROOF_REVOKE_REASONS }),
    revokedByUserId: userRef("revoked_by_user_id"),
    /** The identity claim recorded by the latest successful check. */
    claimId: text("claim_id"),
    createdByUserId: userRef("created_by_user_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("identity_proofs_id_ck", sql`${t.id} ~ '^prv_[0-9a-hjkmnp-tv-z]{26}$'`),
    check("identity_proofs_kind_ck", inList(t.kind, PROOF_KINDS)),
    check("identity_proofs_method_ck", inList(t.method, PROOF_METHODS)),
    check("identity_proofs_status_ck", inList(t.status, PROOF_STATUSES)),
    check("identity_proofs_visibility_ck", inList(t.visibility, PROOF_VISIBILITIES)),
    check(
      "identity_proofs_method_kind_ck",
      sql`(${t.kind} = 'domain' and ${t.method} in ('dns_txt', 'html_file') and ${t.challenge} is not null and ${t.provider} is null)
        or (${t.kind} = 'account' and ${t.method} = 'oauth' and ${t.challenge} is null and ${t.provider} is not null)`,
    ),
    check(
      "identity_proofs_verified_ck",
      sql`${t.status} = 'pending' or (${t.lastVerifiedAt} is not null and ${t.expiresAt} is not null and ${t.claimId} is not null)
        or ${t.status} = 'revoked'`,
    ),
    check(
      "identity_proofs_revoked_ck",
      sql`(${t.status} = 'revoked') = (${t.revokedAt} is not null and ${t.revokedReason} is not null)`,
    ),
    check("identity_proofs_stale_ck", sql`${t.status} <> 'stale' or ${t.staleReason} is not null`),
    unique("identity_proofs_tenant_id_uq").on(t.tenantId, t.id),
    // One live proof per domain or account on a profile.
    uniqueIndex("identity_proofs_live_uq")
      .on(t.profileId, t.kind, t.target)
      .where(sql`${t.status} <> 'revoked'`),
    index("identity_proofs_target_idx").on(t.kind, t.target),
    index("identity_proofs_expiry_idx")
      .on(t.expiresAt)
      .where(sql`${t.status} = 'verified'`),
    foreignKey({
      name: "identity_proofs_profile_fk",
      columns: [t.tenantId, t.profileId],
      foreignColumns: [profiles.tenantId, profiles.id],
    }),
    foreignKey({
      name: "identity_proofs_claim_fk",
      columns: [t.tenantId, t.claimId],
      foreignColumns: [identityClaims.tenantId, identityClaims.id],
    }),
  ],
);

export const identityReviews = trust.table(
  "identity_reviews",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newReviewId()),
    tenantId: tenant(),
    profileId: text("profile_id").notNull(),
    kind: text("kind", { enum: REVIEW_KINDS }).notNull(),
    status: text("status", { enum: REVIEW_STATUSES }).notNull().default("pending"),
    claimType: text("claim_type", { enum: CLAIM_TYPES }),
    ownershipReason: text("ownership_reason", { enum: OWNERSHIP_REASONS }),
    statement: text("statement").notNull(),
    evidence: jsonb("evidence").$type<EvidenceItem[]>().notNull().default([]),
    /** SHA-256 (hex) over the statement and evidence as submitted. */
    evidenceHash: text("evidence_hash").notNull(),
    visibility: text("visibility", { enum: PROOF_VISIBILITIES }).notNull().default("public"),
    requestedByUserId: userRef("requested_by_user_id"),
    requestedBySubjectId: text("requested_by_subject_id").notNull(),
    decidedByUserId: userRef("decided_by_user_id"),
    decidedAt: ts("decided_at"),
    decisionReason: text("decision_reason"),
    /** For approved claims: the identity claim the decision recorded. */
    claimId: text("claim_id"),
    revokedAt: ts("revoked_at"),
    revokedReason: text("revoked_reason"),
    revokedByUserId: userRef("revoked_by_user_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("identity_reviews_id_ck", sql`${t.id} ~ '^rvw_[0-9a-hjkmnp-tv-z]{26}$'`),
    check("identity_reviews_kind_ck", inList(t.kind, REVIEW_KINDS)),
    check("identity_reviews_status_ck", inList(t.status, REVIEW_STATUSES)),
    check("identity_reviews_visibility_ck", inList(t.visibility, PROOF_VISIBILITIES)),
    check(
      "identity_reviews_kind_fields_ck",
      sql`(${t.kind} = 'claim' and ${t.claimType} is not null and ${t.ownershipReason} is null)
        or (${t.kind} = 'ownership' and ${t.ownershipReason} is not null and ${t.claimType} is null)`,
    ),
    check("identity_reviews_hash_ck", sql`${t.evidenceHash} ~ '^[0-9a-f]{64}$'`),
    // Decided requests name who decided, when and why; nobody decides their own request.
    check(
      "identity_reviews_decided_ck",
      sql`(${t.status} in ('approved', 'rejected', 'revoked')) = (${t.decidedAt} is not null)
        and (${t.decidedAt} is null or ${t.decisionReason} is not null)`,
    ),
    check(
      "identity_reviews_separation_ck",
      sql`${t.decidedByUserId} is null or ${t.requestedByUserId} is null or ${t.decidedByUserId} <> ${t.requestedByUserId}`,
    ),
    check(
      "identity_reviews_revoked_ck",
      sql`(${t.status} = 'revoked') = (${t.revokedAt} is not null and ${t.revokedReason} is not null)`,
    ),
    unique("identity_reviews_tenant_id_uq").on(t.tenantId, t.id),
    index("identity_reviews_queue_idx").on(t.tenantId, t.status, t.createdAt),
    // One open ownership request per person and profile.
    uniqueIndex("identity_reviews_open_ownership_uq")
      .on(t.profileId, t.requestedBySubjectId)
      .where(sql`${t.kind} = 'ownership' and ${t.status} = 'pending'`),
    foreignKey({
      name: "identity_reviews_profile_fk",
      columns: [t.tenantId, t.profileId],
      foreignColumns: [profiles.tenantId, profiles.id],
    }),
    foreignKey({
      name: "identity_reviews_requester_fk",
      columns: [t.tenantId, t.requestedBySubjectId],
      foreignColumns: [subjects.tenantId, subjects.id],
    }),
    foreignKey({
      name: "identity_reviews_claim_fk",
      columns: [t.tenantId, t.claimId],
      foreignColumns: [identityClaims.tenantId, identityClaims.id],
    }),
  ],
);
