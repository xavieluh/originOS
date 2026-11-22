// Closed vocabularies shared by the database, API and UI. The database checks
// the same values (packages/db schema), and a test keeps the two in step.

import type { ObjectKind } from "./ids.js";

/**
 * The seven assurance labels of MASTER_SPEC §3, exactly. Each says what was
 * checked and how; none is a "trust score", and they are never merged into a
 * single "human-made" seal. An AI model's output alone never earns a label.
 */
export const ASSURANCE_LABELS = [
  "identity_reviewed",
  "domain_or_account_controlled",
  "signed_provenance_validated",
  "creator_declared_ai_use",
  "agent_action_observed",
  "outcome_confirmed",
  "research_claim_assessed",
] as const;
export type AssuranceLabel = (typeof ASSURANCE_LABELS)[number];

/** How a fact was captured. `inferred` marks machine-suggested facts, which stay reviewable. */
export const CAPTURE_METHODS = [
  "manual",
  "import",
  "api",
  "instrumentation",
  "challenge",
  "c2pa",
  "inferred",
] as const;
export type CaptureMethod = (typeof CAPTURE_METHODS)[number];

/** Who may see a record. `public` only once a later phase publishes it deliberately. */
export const VISIBILITIES = ["private", "tenant", "public"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const SUBJECT_KINDS = ["human", "organization", "agent", "service"] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];

export const WORK_STATUSES = ["draft", "published", "archived"] as const;
export const SOURCE_KINDS = ["paper", "web", "dataset", "book", "repository", "other"] as const;
export const CLAIM_STATUSES = ["open", "supported", "contested", "withdrawn"] as const;
export const RUN_STATUSES = ["running", "succeeded", "failed", "cancelled"] as const;
export const ACTION_STATUSES = [
  "proposed",
  "awaiting_approval",
  "approved",
  "rejected",
  "executed",
  "failed",
] as const;
export const APPROVAL_DECISIONS = ["pending", "approved", "rejected", "expired"] as const;
export const ASSERTION_TYPES = [
  "authorship",
  "ai_use_declaration",
  "c2pa_manifest",
  "signed_receipt",
] as const;
export const REVIEW_STATES = ["unreviewed", "accepted", "rejected"] as const;

/**
 * Allowed typed edges: (type, from kind, to kind). Any other combination is
 * refused by a foreign key to core.relation_rules. Parent/child links that
 * every row needs (a version's work, a run's agent) are foreign keys on the
 * rows themselves, not relations.
 */
export const RELATION_RULES = [
  ["DERIVED_FROM", "work_version", "work_version"],
  ["DERIVED_FROM", "artifact", "artifact"],
  ["CITES", "work_version", "source"],
  ["SUPPORTS", "source", "claim"],
  ["CONTRADICTS", "source", "claim"],
  ["CREATED", "subject", "work"],
  ["CONTRIBUTED_TO", "subject", "work_version"],
  ["ATTESTS", "provenance_assertion", "work_version"],
  ["ATTESTS", "provenance_assertion", "artifact"],
  ["PRODUCED", "agent_run", "artifact"],
  ["PRODUCED", "agent_run", "work_version"],
  ["USED", "agent_run", "source"],
  ["ACTS_FOR", "subject", "subject"],
  ["MEMBER_OF", "subject", "subject"],
] as const satisfies readonly (readonly [string, ObjectKind, ObjectKind])[];

export type RelationType = (typeof RELATION_RULES)[number][0];
export const RELATION_TYPES = [...new Set(RELATION_RULES.map((r) => r[0]))] as RelationType[];

export function relationAllowed(type: string, from: ObjectKind, to: ObjectKind): boolean {
  return RELATION_RULES.some(([t, f, k]) => t === type && f === from && k === to);
}
