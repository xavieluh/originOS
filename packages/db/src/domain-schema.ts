// Canonical domain tables (Phase 06, ADR-002, ADR-025). One Postgres schema per
// bounded context (ARCHITECTURE §5): `trust`, `content`, `evidence`, `agents`,
// plus the shared object registry, typed relations and the outbox in `core`.
//
// Invariants enforced by the database, not only by code:
//  - ids are opaque, prefixed by kind, and checked against their table's kind;
//  - every domain row is registered in core.objects (trigger in 0005), so typed
//    relations can reference any object with real foreign keys;
//  - a child row and every row it references live in the same tenant
//    (composite foreign keys on (tenant_id, id));
//  - relations are only allowed for whitelisted (type, from kind, to kind)
//    triples (foreign key to core.relation_rules);
//  - rows are superseded or revoked, not edited in place, wherever they are
//    evidence (application role has no DELETE; see 0005).
//
// Contracts in @originos/contracts (domain/entities.ts) mirror these columns;
// test/domain-schema.test.ts keeps them in step.
import {
  ACTION_STATUSES,
  APPROVAL_DECISIONS,
  ASSERTION_TYPES,
  ASSURANCE_LABELS,
  CAPTURE_METHODS,
  CLAIM_STATUSES,
  OBJECT_KINDS,
  REVIEW_STATES,
  RUN_STATUSES,
  SOURCE_KINDS,
  SUBJECT_KINDS,
  VISIBILITIES,
  WORK_STATUSES,
  newId,
  type ObjectKind,
} from "@originos/contracts";
import { sql, type SQL } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { agents, core, organizations, users } from "./schema.js";

export const trust = pgSchema("trust");
export const content = pgSchema("content");
export const evidence = pgSchema("evidence");
export const agentsSchema = pgSchema("agents");

const ts = (name: string) => timestamp(name, { withTimezone: true });
const inList = (column: SQL | AnyPgColumn, values: readonly string[]) =>
  sql`${column} in (${sql.raw(values.map((v) => `'${v}'`).join(", "))})`;

/** id, tenant, row format version, timestamps and who created it. */
function baseColumns(kind: ObjectKind) {
  return {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(kind)),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    schemaVersion: integer("schema_version").notNull().default(1),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    createdBySubjectId: text("created_by_subject_id"),
  };
}

/** The provenance fields every evidence-like fact carries (MASTER_SPEC §3). */
function evidenceColumns() {
  return {
    visibility: text("visibility", { enum: VISIBILITIES }).notNull().default("tenant"),
    sourceProvider: text("source_provider"),
    firstSeenAt: ts("first_seen_at").notNull().defaultNow(),
    assertedBySubjectId: text("asserted_by_subject_id"),
    observedBySubjectId: text("observed_by_subject_id"),
    captureMethod: text("capture_method", { enum: CAPTURE_METHODS }).notNull(),
    validationMechanism: text("validation_mechanism"),
    assurance: text("assurance", { enum: ASSURANCE_LABELS }),
    limitations: text("limitations"),
    contentHash: text("content_hash"),
    signature: text("signature"),
    revokedAt: ts("revoked_at"),
  };
}

type Base = ReturnType<typeof baseColumns>;
type Ev = ReturnType<typeof evidenceColumns>;
type Cols<T> = { [K in keyof T]: AnyPgColumn };

/** Constraints shared by every domain table: id format, same-tenant attribution. */
type Constraint =
  | ReturnType<typeof check>
  | ReturnType<ReturnType<typeof unique>["on"]>
  | ReturnType<typeof foreignKey>;

function baseConstraints(name: string, kind: ObjectKind, t: Cols<Base>): Constraint[] {
  return [
    check(
      `${name}_id_ck`,
      sql`${t.id} ~ ${sql.raw(`'^${OBJECT_KINDS[kind]}_[0-9a-hjkmnp-tv-z]{26}$'`)}`,
    ),
    check(`${name}_schema_version_ck`, sql`${t.schemaVersion} > 0`),
    unique(`${name}_tenant_id_uq`).on(t.tenantId, t.id),
    foreignKey({
      name: `${name}_created_by_fk`,
      columns: [t.tenantId, t.createdBySubjectId],
      foreignColumns: [subjects.tenantId, subjects.id],
    }),
  ];
}

function evidenceConstraints(name: string, t: Cols<Base & Ev>): Constraint[] {
  return [
    check(`${name}_visibility_ck`, inList(t.visibility, VISIBILITIES)),
    check(`${name}_capture_method_ck`, inList(t.captureMethod, CAPTURE_METHODS)),
    check(
      `${name}_assurance_ck`,
      sql`${t.assurance} is null or ${inList(t.assurance, ASSURANCE_LABELS)}`,
    ),
    check(
      `${name}_content_hash_ck`,
      sql`${t.contentHash} is null or ${t.contentHash} ~ '^[0-9a-f]{64}$'`,
    ),
    // A machine inference never carries an assurance label by itself (CLAUDE.md rule 6).
    check(
      `${name}_inferred_unlabeled_ck`,
      sql`${t.captureMethod} <> 'inferred' or ${t.assurance} is null`,
    ),
    foreignKey({
      name: `${name}_asserted_by_fk`,
      columns: [t.tenantId, t.assertedBySubjectId],
      foreignColumns: [subjects.tenantId, subjects.id],
    }),
    foreignKey({
      name: `${name}_observed_by_fk`,
      columns: [t.tenantId, t.observedBySubjectId],
      foreignColumns: [subjects.tenantId, subjects.id],
    }),
  ];
}

// --- Object registry and typed relations (core) -----------------------------

/**
 * One row per domain object, written by trigger when the object is inserted
 * and removed when it is deleted. Lets relations and assertions reference any
 * object with a real foreign key, so edges can never point at nothing.
 */
export const objects = core.table(
  "objects",
  {
    id: text("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("objects_tenant_id_kind_uq").on(t.tenantId, t.id, t.kind),
    unique("objects_tenant_id_uq").on(t.tenantId, t.id),
    check("objects_kind_ck", inList(t.kind, Object.keys(OBJECT_KINDS))),
  ],
);

/** The whitelist of (type, from kind, to kind) triples. Seeded from RELATION_RULES in 0005. */
export const relationRules = core.table(
  "relation_rules",
  {
    type: text("type").notNull(),
    fromKind: text("from_kind").notNull(),
    toKind: text("to_kind").notNull(),
    description: text("description"),
  },
  (t) => [primaryKey({ name: "relation_rules_pk", columns: [t.type, t.fromKind, t.toKind] })],
);

// --- Trust ------------------------------------------------------------------

/** Every actor is a Subject: a person, an organization, an agent or a service (ADR-002). */
export const subjects = trust.table(
  "subjects",
  {
    ...baseColumns("subject"),
    kind: text("kind", { enum: SUBJECT_KINDS }).notNull(),
    displayName: text("display_name").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    agentId: uuid("agent_id").references(() => agents.id),
  },
  (t) => [
    ...baseConstraints("subjects", "subject", t),
    unique("subjects_tenant_id_kind_uq").on(t.tenantId, t.id, t.kind),
    check("subjects_kind_ck", inList(t.kind, SUBJECT_KINDS)),
    check("subjects_agent_link_ck", sql`(${t.kind} = 'agent') = (${t.agentId} is not null)`),
    check("subjects_user_link_ck", sql`${t.kind} = 'human' or ${t.userId} is null`),
    uniqueIndex("subjects_tenant_user_uq").on(t.tenantId, t.userId),
    uniqueIndex("subjects_agent_uq").on(t.agentId),
  ],
);

export const identityClaims = trust.table(
  "identity_claims",
  {
    ...baseColumns("identity_claim"),
    ...evidenceColumns(),
    subjectId: text("subject_id").notNull(),
    claimType: text("claim_type").notNull(),
    value: text("value").notNull(),
    supersededById: text("superseded_by_id"),
  },
  (t) => [
    ...baseConstraints("identity_claims", "identity_claim", t),
    ...evidenceConstraints("identity_claims", t),
    foreignKey({
      name: "identity_claims_subject_fk",
      columns: [t.tenantId, t.subjectId],
      foreignColumns: [subjects.tenantId, subjects.id],
    }),
    foreignKey({
      name: "identity_claims_superseded_by_fk",
      columns: [t.tenantId, t.supersededById],
      foreignColumns: [t.tenantId, t.id],
    }),
    index("identity_claims_subject_idx").on(t.tenantId, t.subjectId),
  ],
);

/** "Attestation" in the UI: an assertion about an object, optionally signed (ADR-006). */
export const provenanceAssertions = trust.table(
  "provenance_assertions",
  {
    ...baseColumns("provenance_assertion"),
    ...evidenceColumns(),
    targetId: text("target_id").notNull(),
    assertionType: text("assertion_type", { enum: ASSERTION_TYPES }).notNull(),
    /** The asserted statement (ids and declared facts). Never secrets. */
    statement: jsonb("statement").$type<Record<string, unknown>>().notNull().default({}),
    signerKeyId: text("signer_key_id"),
  },
  (t) => [
    ...baseConstraints("provenance_assertions", "provenance_assertion", t),
    ...evidenceConstraints("provenance_assertions", t),
    check("provenance_assertions_type_ck", inList(t.assertionType, ASSERTION_TYPES)),
    check(
      "provenance_assertions_signed_ck",
      sql`(${t.signature} is null) = (${t.signerKeyId} is null)`,
    ),
    foreignKey({
      name: "provenance_assertions_target_fk",
      columns: [t.tenantId, t.targetId],
      foreignColumns: [objects.tenantId, objects.id],
    }),
    index("provenance_assertions_target_idx").on(t.tenantId, t.targetId),
  ],
);

// --- Content ----------------------------------------------------------------

export const works = content.table(
  "works",
  {
    ...baseColumns("work"),
    title: text("title").notNull(),
    status: text("status", { enum: WORK_STATUSES }).notNull().default("draft"),
    ownerSubjectId: text("owner_subject_id").notNull(),
  },
  (t) => [
    ...baseConstraints("works", "work", t),
    check("works_status_ck", inList(t.status, WORK_STATUSES)),
    foreignKey({
      name: "works_owner_fk",
      columns: [t.tenantId, t.ownerSubjectId],
      foreignColumns: [subjects.tenantId, subjects.id],
    }),
  ],
);

export const workVersions = content.table(
  "work_versions",
  {
    ...baseColumns("work_version"),
    ...evidenceColumns(),
    workId: text("work_id").notNull(),
    versionNumber: integer("version_number").notNull(),
    /** Hash of normalized text, kept separate from the exact-bytes content_hash (ARCHITECTURE §6). */
    normalizedTextHash: text("normalized_text_hash"),
    note: text("note"),
  },
  (t) => [
    ...baseConstraints("work_versions", "work_version", t),
    ...evidenceConstraints("work_versions", t),
    unique("work_versions_number_uq").on(t.workId, t.versionNumber),
    check("work_versions_number_ck", sql`${t.versionNumber} > 0`),
    check(
      "work_versions_normalized_hash_ck",
      sql`${t.normalizedTextHash} is null or ${t.normalizedTextHash} ~ '^[0-9a-f]{64}$'`,
    ),
    foreignKey({
      name: "work_versions_work_fk",
      columns: [t.tenantId, t.workId],
      foreignColumns: [works.tenantId, works.id],
    }).onDelete("cascade"),
  ],
);

/** Stored bytes ("Asset") or an external reference. */
export const artifacts = content.table(
  "artifacts",
  {
    ...baseColumns("artifact"),
    ...evidenceColumns(),
    workVersionId: text("work_version_id"),
    storageKey: text("storage_key"),
    externalUrl: text("external_url"),
    mediaType: text("media_type").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }),
  },
  (t) => [
    ...baseConstraints("artifacts", "artifact", t),
    ...evidenceConstraints("artifacts", t),
    check(
      "artifacts_location_ck",
      sql`(${t.storageKey} is not null) <> (${t.externalUrl} is not null)`,
    ),
    check("artifacts_byte_size_ck", sql`${t.byteSize} is null or ${t.byteSize} >= 0`),
    uniqueIndex("artifacts_storage_key_uq").on(t.storageKey),
    foreignKey({
      name: "artifacts_work_version_fk",
      columns: [t.tenantId, t.workVersionId],
      foreignColumns: [workVersions.tenantId, workVersions.id],
    }),
  ],
);

// --- Evidence ---------------------------------------------------------------

export const sources = evidence.table(
  "sources",
  {
    ...baseColumns("source"),
    ...evidenceColumns(),
    kind: text("kind", { enum: SOURCE_KINDS }).notNull(),
    title: text("title").notNull(),
    url: text("url"),
    doi: text("doi"),
    retrievedAt: ts("retrieved_at"),
  },
  (t) => [
    ...baseConstraints("sources", "source", t),
    ...evidenceConstraints("sources", t),
    check("sources_kind_ck", inList(t.kind, SOURCE_KINDS)),
    uniqueIndex("sources_tenant_doi_uq").on(t.tenantId, t.doi),
  ],
);

export const claims = evidence.table(
  "claims",
  {
    ...baseColumns("claim"),
    ...evidenceColumns(),
    statement: text("statement").notNull(),
    status: text("status", { enum: CLAIM_STATUSES }).notNull().default("open"),
    supersededById: text("superseded_by_id"),
  },
  (t) => [
    ...baseConstraints("claims", "claim", t),
    ...evidenceConstraints("claims", t),
    check("claims_status_ck", inList(t.status, CLAIM_STATUSES)),
    foreignKey({
      name: "claims_superseded_by_fk",
      columns: [t.tenantId, t.supersededById],
      foreignColumns: [t.tenantId, t.id],
    }),
  ],
);

// --- Agents -----------------------------------------------------------------

export const agentRuns = agentsSchema.table(
  "agent_runs",
  {
    ...baseColumns("agent_run"),
    ...evidenceColumns(),
    agentSubjectId: text("agent_subject_id").notNull(),
    /** Always 'agent': lets a composite foreign key require that the subject is an agent. */
    agentSubjectKind: text("agent_subject_kind")
      .notNull()
      .generatedAlwaysAs(sql`'agent'`),
    status: text("status", { enum: RUN_STATUSES }).notNull().default("running"),
    startedAt: ts("started_at").notNull().defaultNow(),
    endedAt: ts("ended_at"),
    externalRunRef: text("external_run_ref"),
  },
  (t) => [
    ...baseConstraints("agent_runs", "agent_run", t),
    ...evidenceConstraints("agent_runs", t),
    check("agent_runs_status_ck", inList(t.status, RUN_STATUSES)),
    check("agent_runs_ended_ck", sql`(${t.status} = 'running') = (${t.endedAt} is null)`),
    foreignKey({
      name: "agent_runs_agent_fk",
      columns: [t.tenantId, t.agentSubjectId, t.agentSubjectKind],
      foreignColumns: [subjects.tenantId, subjects.id, subjects.kind],
    }),
    index("agent_runs_agent_idx").on(t.tenantId, t.agentSubjectId, t.startedAt),
  ],
);

export const toolActions = agentsSchema.table(
  "tool_actions",
  {
    ...baseColumns("tool_action"),
    ...evidenceColumns(),
    runId: text("run_id").notNull(),
    toolName: text("tool_name").notNull(),
    status: text("status", { enum: ACTION_STATUSES }).notNull().default("proposed"),
    /** Caller-supplied key: the same action can be recorded only once per tenant. */
    idempotencyKey: text("idempotency_key").notNull(),
    inputHash: text("input_hash"),
    outcomeConfirmedAt: ts("outcome_confirmed_at"),
  },
  (t) => [
    ...baseConstraints("tool_actions", "tool_action", t),
    ...evidenceConstraints("tool_actions", t),
    check("tool_actions_status_ck", inList(t.status, ACTION_STATUSES)),
    check(
      "tool_actions_input_hash_ck",
      sql`${t.inputHash} is null or ${t.inputHash} ~ '^[0-9a-f]{64}$'`,
    ),
    unique("tool_actions_idempotency_uq").on(t.tenantId, t.idempotencyKey),
    foreignKey({
      name: "tool_actions_run_fk",
      columns: [t.tenantId, t.runId],
      foreignColumns: [agentRuns.tenantId, agentRuns.id],
    }),
  ],
);

export const approvals = agentsSchema.table(
  "approvals",
  {
    ...baseColumns("approval"),
    actionId: text("action_id").notNull(),
    decision: text("decision", { enum: APPROVAL_DECISIONS }).notNull().default("pending"),
    requestedAt: ts("requested_at").notNull().defaultNow(),
    decidedBySubjectId: text("decided_by_subject_id"),
    decidedAt: ts("decided_at"),
    reason: text("reason"),
  },
  (t) => [
    ...baseConstraints("approvals", "approval", t),
    check("approvals_decision_ck", inList(t.decision, APPROVAL_DECISIONS)),
    // A person decides (or it expires); pending approvals have no decision yet.
    check(
      "approvals_decided_ck",
      sql`(${t.decision} = 'pending') = (${t.decidedAt} is null) and (${t.decision} in ('pending', 'expired') or ${t.decidedBySubjectId} is not null)`,
    ),
    foreignKey({
      name: "approvals_action_fk",
      columns: [t.tenantId, t.actionId],
      foreignColumns: [toolActions.tenantId, toolActions.id],
    }),
    foreignKey({
      name: "approvals_decided_by_fk",
      columns: [t.tenantId, t.decidedBySubjectId],
      foreignColumns: [subjects.tenantId, subjects.id],
    }),
    uniqueIndex("approvals_one_pending_uq")
      .on(t.actionId)
      .where(sql`${t.decision} = 'pending'`),
  ],
);

// --- Typed relations --------------------------------------------------------

export const relations = core.table(
  "relations",
  {
    ...baseColumns("relation"),
    ...evidenceColumns(),
    type: text("type").notNull(),
    fromId: text("from_id").notNull(),
    fromKind: text("from_kind").notNull(),
    toId: text("to_id").notNull(),
    toKind: text("to_kind").notNull(),
    /** Inferred edges start unreviewed; a person accepts or rejects them. */
    reviewState: text("review_state", { enum: REVIEW_STATES }),
    supersededById: text("superseded_by_id"),
  },
  (t) => [
    ...baseConstraints("relations", "relation", t),
    ...evidenceConstraints("relations", t),
    check("relations_no_self_ck", sql`${t.fromId} <> ${t.toId}`),
    check(
      "relations_review_ck",
      sql`(${t.captureMethod} = 'inferred') = (${t.reviewState} is not null)`,
    ),
    foreignKey({
      name: "relations_rule_fk",
      columns: [t.type, t.fromKind, t.toKind],
      foreignColumns: [relationRules.type, relationRules.fromKind, relationRules.toKind],
    }),
    foreignKey({
      name: "relations_from_fk",
      columns: [t.tenantId, t.fromId, t.fromKind],
      foreignColumns: [objects.tenantId, objects.id, objects.kind],
    }),
    foreignKey({
      name: "relations_to_fk",
      columns: [t.tenantId, t.toId, t.toKind],
      foreignColumns: [objects.tenantId, objects.id, objects.kind],
    }),
    foreignKey({
      name: "relations_superseded_by_fk",
      columns: [t.tenantId, t.supersededById],
      foreignColumns: [t.tenantId, t.id],
    }),
    uniqueIndex("relations_live_uq")
      .on(t.tenantId, t.type, t.fromId, t.toId)
      .where(sql`${t.revokedAt} is null and ${t.supersededById} is null`),
    index("relations_to_idx").on(t.tenantId, t.toId),
  ],
);

// --- Transactional outbox (ADR-003) ------------------------------------------

/**
 * Events written in the same transaction as the change they describe. The
 * worker delivers them at least once; consumers record receipts so each
 * processes an event at most once logically.
 */
export const outboxEvents = core.table(
  "outbox_events",
  {
    id: text("id").primaryKey(),
    tenantId: uuid("tenant_id").references(() => organizations.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    subjectRef: text("subject_ref"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    correlationId: text("correlation_id"),
    causationId: text("causation_id"),
    occurredAt: ts("occurred_at").notNull().defaultNow(),
    status: text("status", { enum: ["pending", "delivered", "dead"] })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: ts("available_at").notNull().defaultNow(),
    lockedBy: text("locked_by"),
    lockedUntil: ts("locked_until"),
    lastError: text("last_error"),
    deliveredAt: ts("delivered_at"),
  },
  (t) => [
    check("outbox_events_id_ck", sql`${t.id} ~ '^evt_[0-9a-hjkmnp-tv-z]{26}$'`),
    check("outbox_events_type_ck", sql`${t.type} ~ '^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$'`),
    check("outbox_events_status_ck", sql`${t.status} in ('pending', 'delivered', 'dead')`),
    index("outbox_events_ready_idx")
      .on(t.availableAt)
      .where(sql`${t.status} = 'pending'`),
  ],
);

/** (event, consumer) pairs already processed. The primary key is the idempotency guard. */
export const outboxReceipts = core.table(
  "outbox_receipts",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => outboxEvents.id, { onDelete: "cascade" }),
    consumer: text("consumer").notNull(),
    processedAt: ts("processed_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: "outbox_receipts_pk", columns: [t.eventId, t.consumer] })],
);
