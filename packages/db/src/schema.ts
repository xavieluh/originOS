// Drizzle table definitions. One Postgres schema per bounded context
// (ARCHITECTURE §5); Phase 04 adds the first one, `core`: accounts, sessions,
// organizations (tenants), memberships, invitations and a minimal audit log.
// Changes go through new migrations in ../migrations, never in-place edits
// of applied ones (CLAUDE.md rule 12).
//
// Row-level security for the tenant-owned tables (organizations, memberships,
// invitations, audit_events) is defined in the hand-written migration
// 0001_core_rls.sql, because drizzle-kit does not express it.
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const core = pgSchema("core");

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// --- Authentication (field names follow Better Auth's model, ADR-022) -------

export const users = core.table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Stored lowercase by Better Auth. Unique across the platform. */
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = core.table(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Opaque bearer secret held only in the httpOnly cookie. */
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Workspace the person last switched to. Re-checked against memberships on every request. */
    activeOrganizationId: uuid("active_organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = core.table(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    /** Password hash (scrypt, Better Auth default). Never selected outside the auth library. */
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verifications = core.table(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

export const twoFactors = core.table(
  "two_factors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** TOTP secret, encrypted by Better Auth with the auth secret. */
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(false),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [
    index("two_factors_user_id_idx").on(t.userId),
    index("two_factors_secret_idx").on(t.secret),
  ],
);

export const passkeys = core.table(
  "passkeys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    aaguid: text("aaguid"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("passkeys_user_id_idx").on(t.userId),
    index("passkeys_credential_id_idx").on(t.credentialID),
  ],
);

// --- Tenancy (ADR-010: tenant = organization) --------------------------------

export const ROLES = ["owner", "admin", "member"] as const;
export type Role = (typeof ROLES)[number];
export const INVITABLE_ROLES = ["admin", "member"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const organizations = core.table("organizations", {
  /** The tenant id. Generated by the API so RLS context can be set before insert. */
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const memberships = core.table(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ROLES }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("memberships_tenant_user_uq").on(t.tenantId, t.userId),
    // Exactly one owner per organization is enforced by the database, not only the API.
    uniqueIndex("memberships_one_owner_uq")
      .on(t.tenantId)
      .where(sql`${t.role} = 'owner'`),
    index("memberships_user_id_idx").on(t.userId),
    check("memberships_role_ck", sql`${t.role} in ('owner', 'admin', 'member')`),
  ],
);

export const invitations = core.table(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Lowercased. Only a signed-in user with this verified email can accept. */
    email: text("email").notNull(),
    role: text("role", { enum: INVITABLE_ROLES }).notNull(),
    /** SHA-256 of the token sent by email; the token itself is never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: uuid("accepted_by").references(() => users.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("invitations_tenant_id_idx").on(t.tenantId),
    check("invitations_role_ck", sql`${t.role} in ('admin', 'member')`),
    check(
      "invitations_single_outcome_ck",
      sql`not (${t.acceptedAt} is not null and ${t.revokedAt} is not null)`,
    ),
  ],
);

/**
 * Minimal append-only audit log for account and workspace lifecycle events.
 * Phase 06 builds the full ledger and outbox on top of this table by migration.
 * The application role may insert and select, never update or delete.
 */
export const auditEvents = core.table(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    /** Non-secret details only (ids, roles). Never tokens or email bodies. */
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    correlationId: text("correlation_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * Tamper-evident chain (Phase 06): per-tenant sequence number and SHA-256
     * over this event and the previous event's hash. Set by a database trigger
     * (migration 0005); never supplied by the application.
     */
    seq: bigint("seq", { mode: "number" }),
    prevHash: text("prev_hash"),
    hash: text("hash"),
    /**
     * SHA-256 of the actor's user id, set by the same trigger. The chain hashes
     * this instead of actor_user_id, so erasing a person (actor_user_id set to
     * null) keeps the chain verifiable. A pseudonym, not anonymization: anyone
     * who still holds the user id can link it (docs/RETENTION.md).
     */
    actorDigest: text("actor_digest"),
  },
  (t) => [
    index("audit_events_tenant_time_idx").on(t.tenantId, t.occurredAt),
    uniqueIndex("audit_events_tenant_seq_uq").on(t.tenantId, t.seq),
  ],
);

// --- Authorization and consent (Phase 05, ADR-024) ---------------------------

export const AGENT_STATUSES = ["active", "disabled"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

/**
 * Agent principals: software acting for a person inside one organization.
 * Every agent has an accountable owner and can never do more than that owner
 * (enforced by @originos/authz). Agents are disabled, never deleted, so audit
 * history keeps its subject.
 */
export const agents = core.table(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: AGENT_STATUSES }).notNull().default("active"),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    disabledBy: uuid("disabled_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("agents_tenant_id_idx").on(t.tenantId),
    check("agents_status_ck", sql`${t.status} in ('active', 'disabled')`),
  ],
);

export const GRANT_SUBJECT_TYPES = ["user", "agent", "service"] as const;
export type GrantSubjectType = (typeof GRANT_SUBJECT_TYPES)[number];

/**
 * Resource-scoped grants and explicit denies. Revoked, never deleted or
 * edited: the application role may only set revoked_at / revoked_by.
 */
export const permissionGrants = core.table(
  "permission_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    subjectType: text("subject_type", { enum: GRANT_SUBJECT_TYPES }).notNull(),
    /** users.id or agents.id (services arrive with API credentials in a later phase). */
    subjectId: uuid("subject_id").notNull(),
    effect: text("effect", { enum: ["allow", "deny"] }).notNull(),
    /** A resource type from @originos/authz, or "*". */
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    actions: text("actions").array().notNull(),
    reason: text("reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    index("permission_grants_subject_idx").on(t.tenantId, t.subjectType, t.subjectId),
    check(
      "permission_grants_subject_type_ck",
      sql`${t.subjectType} in ('user', 'agent', 'service')`,
    ),
    check("permission_grants_effect_ck", sql`${t.effect} in ('allow', 'deny')`),
    check(
      "permission_grants_actions_ck",
      sql`cardinality(${t.actions}) > 0 and ${t.actions} <@ array['read','write','publish','export','admin']::text[]`,
    ),
  ],
);

export const CONSENT_PURPOSES = [
  "identity_directory",
  "telemetry_collection",
  "data_sharing",
  "provider_scopes",
  "cross_org_policy",
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

/**
 * Consent records. Personal consents (subject_type "user") are given and
 * revoked by that person; organization policies by owners and admins. A
 * revoked record is kept for history; giving consent again adds a new row.
 */
export const consents = core.table(
  "consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    subjectType: text("subject_type", { enum: ["user", "organization"] }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose", { enum: CONSENT_PURPOSES }).notNull(),
    /** Identifies what the consent covers within its purpose, e.g. a provider name or partner organization id. */
    scopeKey: text("scope_key").notNull().default(""),
    /** Non-secret details shown to the person (e.g. provider scopes). */
    scope: jsonb("scope").$type<Record<string, string | string[]>>().notNull().default({}),
    /** Version of the wording the person agreed to. */
    policyVersion: text("policy_version").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    index("consents_tenant_idx").on(t.tenantId, t.purpose),
    uniqueIndex("consents_one_active_uq")
      .on(
        t.tenantId,
        t.subjectType,
        sql`coalesce(${t.userId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
        t.purpose,
        t.scopeKey,
      )
      .where(sql`${t.revokedAt} is null`),
    check(
      "consents_subject_ck",
      sql`(${t.subjectType} = 'user' and ${t.userId} is not null) or (${t.subjectType} = 'organization' and ${t.userId} is null)`,
    ),
    check(
      "consents_purpose_ck",
      sql`${t.purpose} in ('identity_directory', 'telemetry_collection', 'data_sharing', 'provider_scopes', 'cross_org_policy')`,
    ),
  ],
);
