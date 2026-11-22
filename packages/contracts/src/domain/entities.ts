// The canonical domain objects (MASTER_SPEC §3, ADR-002) as their API
// representation. Each field matches a database column (camelCase here,
// snake_case in Postgres); packages/db tests that they stay in step.
//
// Common to every object: opaque `id`, `tenantId`, `schemaVersion` (row
// format version, bumped by migrations that change a row's meaning),
// timestamps and actor attribution (`createdBySubjectId`).

import { z } from "zod";
import { idOf } from "./ids.js";
import {
  ACTION_STATUSES,
  APPROVAL_DECISIONS,
  ASSERTION_TYPES,
  ASSURANCE_LABELS,
  CAPTURE_METHODS,
  CLAIM_STATUSES,
  RELATION_TYPES,
  REVIEW_STATES,
  RUN_STATUSES,
  SOURCE_KINDS,
  SUBJECT_KINDS,
  VISIBILITIES,
  WORK_STATUSES,
} from "./vocabulary.js";

const Timestamp = z.iso.datetime({ offset: true });
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/, "a lowercase hex SHA-256");
const Uuid = z.uuid();

const base = (kind: Parameters<typeof idOf>[0]) => ({
  id: idOf(kind),
  tenantId: Uuid,
  schemaVersion: z.number().int().positive(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  createdBySubjectId: idOf("subject").nullable(),
});

/**
 * Provenance fields on every evidence-like fact (MASTER_SPEC §3): who asserted
 * it, who observed it, how it was captured and checked, what it cannot tell
 * you, and whether it was superseded or revoked.
 */
export const EvidenceFields = {
  visibility: z.enum(VISIBILITIES),
  sourceProvider: z.string().nullable(),
  firstSeenAt: Timestamp,
  assertedBySubjectId: idOf("subject").nullable(),
  observedBySubjectId: idOf("subject").nullable(),
  captureMethod: z.enum(CAPTURE_METHODS),
  validationMechanism: z.string().nullable(),
  assurance: z.enum(ASSURANCE_LABELS).nullable(),
  limitations: z.string().nullable(),
  contentHash: Sha256.nullable(),
  signature: z.string().nullable(),
  revokedAt: Timestamp.nullable(),
};

export const Subject = z.object({
  ...base("subject"),
  kind: z.enum(SUBJECT_KINDS),
  displayName: z.string(),
  userId: Uuid.nullable(),
  agentId: Uuid.nullable(),
});

export const IdentityClaim = z.object({
  ...base("identity_claim"),
  ...EvidenceFields,
  subjectId: idOf("subject"),
  claimType: z.string(),
  value: z.string(),
  supersededById: idOf("identity_claim").nullable(),
});

export const Work = z.object({
  ...base("work"),
  title: z.string(),
  status: z.enum(WORK_STATUSES),
  ownerSubjectId: idOf("subject"),
});

export const WorkVersion = z.object({
  ...base("work_version"),
  ...EvidenceFields,
  workId: idOf("work"),
  versionNumber: z.number().int().positive(),
  normalizedTextHash: Sha256.nullable(),
  note: z.string().nullable(),
});

export const Artifact = z.object({
  ...base("artifact"),
  ...EvidenceFields,
  workVersionId: idOf("work_version").nullable(),
  storageKey: z.string().nullable(),
  externalUrl: z.url().nullable(),
  mediaType: z.string(),
  byteSize: z.number().int().nonnegative().nullable(),
});

export const Source = z.object({
  ...base("source"),
  ...EvidenceFields,
  kind: z.enum(SOURCE_KINDS),
  title: z.string(),
  url: z.url().nullable(),
  doi: z.string().nullable(),
  retrievedAt: Timestamp.nullable(),
});

export const Claim = z.object({
  ...base("claim"),
  ...EvidenceFields,
  statement: z.string(),
  status: z.enum(CLAIM_STATUSES),
  supersededById: idOf("claim").nullable(),
});

export const AgentRun = z.object({
  ...base("agent_run"),
  ...EvidenceFields,
  agentSubjectId: idOf("subject"),
  status: z.enum(RUN_STATUSES),
  startedAt: Timestamp,
  endedAt: Timestamp.nullable(),
  externalRunRef: z.string().nullable(),
});

export const ToolAction = z.object({
  ...base("tool_action"),
  ...EvidenceFields,
  runId: idOf("agent_run"),
  toolName: z.string(),
  status: z.enum(ACTION_STATUSES),
  idempotencyKey: z.string(),
  inputHash: Sha256.nullable(),
  outcomeConfirmedAt: Timestamp.nullable(),
});

export const Approval = z.object({
  ...base("approval"),
  actionId: idOf("tool_action"),
  decision: z.enum(APPROVAL_DECISIONS),
  requestedAt: Timestamp,
  decidedBySubjectId: idOf("subject").nullable(),
  decidedAt: Timestamp.nullable(),
  reason: z.string().nullable(),
});

/** "Attestation" in the UI: an assertion about an object, optionally signed (ADR-002, ADR-006). */
export const ProvenanceAssertion = z.object({
  ...base("provenance_assertion"),
  ...EvidenceFields,
  targetId: z.string(),
  assertionType: z.enum(ASSERTION_TYPES),
  statement: z.record(z.string(), z.unknown()),
  signerKeyId: z.string().nullable(),
});

/** A typed, provenance-bearing edge. Allowed types per kind pair: RELATION_RULES. */
export const Relation = z.object({
  ...base("relation"),
  ...EvidenceFields,
  type: z.enum(RELATION_TYPES as [string, ...string[]]),
  fromId: z.string(),
  fromKind: z.string(),
  toId: z.string(),
  toKind: z.string(),
  reviewState: z.enum(REVIEW_STATES).nullable(),
  supersededById: idOf("relation").nullable(),
});

/** Contract name → schema, for documentation and drift tests. */
export const DOMAIN_ENTITIES = {
  subjects: Subject,
  identityClaims: IdentityClaim,
  works: Work,
  workVersions: WorkVersion,
  artifacts: Artifact,
  sources: Source,
  claims: Claim,
  agentRuns: AgentRun,
  toolActions: ToolAction,
  approvals: Approval,
  provenanceAssertions: ProvenanceAssertion,
  relations: Relation,
} as const;
