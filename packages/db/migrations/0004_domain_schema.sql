CREATE SCHEMA "agents";
--> statement-breakpoint
CREATE SCHEMA "content";
--> statement-breakpoint
CREATE SCHEMA "evidence";
--> statement-breakpoint
CREATE SCHEMA "trust";
--> statement-breakpoint
CREATE TABLE "agents"."agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_subject_id" text,
	"visibility" text DEFAULT 'tenant' NOT NULL,
	"source_provider" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"asserted_by_subject_id" text,
	"observed_by_subject_id" text,
	"capture_method" text NOT NULL,
	"validation_mechanism" text,
	"assurance" text,
	"limitations" text,
	"content_hash" text,
	"signature" text,
	"revoked_at" timestamp with time zone,
	"agent_subject_id" text NOT NULL,
	"agent_subject_kind" text GENERATED ALWAYS AS ('agent') STORED NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"external_run_ref" text,
	CONSTRAINT "agent_runs_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "agent_runs_id_ck" CHECK ("agents"."agent_runs"."id" ~ '^run_[0-9a-hjkmnp-tv-z]{26}$'),
	CONSTRAINT "agent_runs_schema_version_ck" CHECK ("agents"."agent_runs"."schema_version" > 0),
	CONSTRAINT "agent_runs_visibility_ck" CHECK ("agents"."agent_runs"."visibility" in ('private', 'tenant', 'public')),
	CONSTRAINT "agent_runs_capture_method_ck" CHECK ("agents"."agent_runs"."capture_method" in ('manual', 'import', 'api', 'instrumentation', 'challenge', 'c2pa', 'inferred')),
	CONSTRAINT "agent_runs_assurance_ck" CHECK ("agents"."agent_runs"."assurance" is null or "agents"."agent_runs"."assurance" in ('identity_reviewed', 'domain_or_account_controlled', 'signed_provenance_validated', 'creator_declared_ai_use', 'agent_action_observed', 'outcome_confirmed', 'research_claim_assessed')),
	CONSTRAINT "agent_runs_content_hash_ck" CHECK ("agents"."agent_runs"."content_hash" is null or "agents"."agent_runs"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "agent_runs_inferred_unlabeled_ck" CHECK ("agents"."agent_runs"."capture_method" <> 'inferred' or "agents"."agent_runs"."assurance" is null),
	CONSTRAINT "agent_runs_status_ck" CHECK ("agents"."agent_runs"."status" in ('running', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "agent_runs_ended_ck" CHECK (("agents"."agent_runs"."status" = 'running') = ("agents"."agent_runs"."ended_at" is null))
);
--> statement-breakpoint
CREATE TABLE "agents"."approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_subject_id" text,
	"action_id" text NOT NULL,
	"decision" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_subject_id" text,
	"decided_at" timestamp with time zone,
	"reason" text,
	CONSTRAINT "approvals_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "approvals_id_ck" CHECK ("agents"."approvals"."id" ~ '^apr_[0-9a-hjkmnp-tv-z]{26}$'),
	CONSTRAINT "approvals_schema_version_ck" CHECK ("agents"."approvals"."schema_version" > 0),
	CONSTRAINT "approvals_decision_ck" CHECK ("agents"."approvals"."decision" in ('pending', 'approved', 'rejected', 'expired')),
	CONSTRAINT "approvals_decided_ck" CHECK (("agents"."approvals"."decision" = 'pending') = ("agents"."approvals"."decided_at" is null) and ("agents"."approvals"."decision" in ('pending', 'expired') or "agents"."approvals"."decided_by_subject_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "content"."artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_subject_id" text,
	"visibility" text DEFAULT 'tenant' NOT NULL,
	"source_provider" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"asserted_by_subject_id" text,
	"observed_by_subject_id" text,
	"capture_method" text NOT NULL,
	"validation_mechanism" text,
	"assurance" text,
	"limitations" text,
	"content_hash" text,
	"signature" text,
	"revoked_at" timestamp with time zone,
	"work_version_id" text,
	"storage_key" text,
	"external_url" text,
	"media_type" text NOT NULL,
	"byte_size" bigint,
	CONSTRAINT "artifacts_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "artifacts_id_ck" CHECK ("content"."artifacts"."id" ~ '^art_[0-9a-hjkmnp-tv-z]{26}$'),
	CONSTRAINT "artifacts_schema_version_ck" CHECK ("content"."artifacts"."schema_version" > 0),
	CONSTRAINT "artifacts_visibility_ck" CHECK ("content"."artifacts"."visibility" in ('private', 'tenant', 'public')),
	CONSTRAINT "artifacts_capture_method_ck" CHECK ("content"."artifacts"."capture_method" in ('manual', 'import', 'api', 'instrumentation', 'challenge', 'c2pa', 'inferred')),
	CONSTRAINT "artifacts_assurance_ck" CHECK ("content"."artifacts"."assurance" is null or "content"."artifacts"."assurance" in ('identity_reviewed', 'domain_or_account_controlled', 'signed_provenance_validated', 'creator_declared_ai_use', 'agent_action_observed', 'outcome_confirmed', 'research_claim_assessed')),
	CONSTRAINT "artifacts_content_hash_ck" CHECK ("content"."artifacts"."content_hash" is null or "content"."artifacts"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "artifacts_inferred_unlabeled_ck" CHECK ("content"."artifacts"."capture_method" <> 'inferred' or "content"."artifacts"."assurance" is null),
	CONSTRAINT "artifacts_location_ck" CHECK (("content"."artifacts"."storage_key" is not null) <> ("content"."artifacts"."external_url" is not null)),
	CONSTRAINT "artifacts_byte_size_ck" CHECK ("content"."artifacts"."byte_size" is null or "content"."artifacts"."byte_size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "evidence"."claims" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_subject_id" text,
	"visibility" text DEFAULT 'tenant' NOT NULL,
	"source_provider" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"asserted_by_subject_id" text,
	"observed_by_subject_id" text,
	"capture_method" text NOT NULL,
	"validation_mechanism" text,
	"assurance" text,
	"limitations" text,
	"content_hash" text,
	"signature" text,
	"revoked_at" timestamp with time zone,
	"statement" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"superseded_by_id" text,
	CONSTRAINT "claims_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "claims_id_ck" CHECK ("evidence"."claims"."id" ~ '^clm_[0-9a-hjkmnp-tv-z]{26}$'),
	CONSTRAINT "claims_schema_version_ck" CHECK ("evidence"."claims"."schema_version" > 0),
	CONSTRAINT "claims_visibility_ck" CHECK ("evidence"."claims"."visibility" in ('private', 'tenant', 'public')),
	CONSTRAINT "claims_capture_method_ck" CHECK ("evidence"."claims"."capture_method" in ('manual', 'import', 'api', 'instrumentation', 'challenge', 'c2pa', 'inferred')),
	CONSTRAINT "claims_assurance_ck" CHECK ("evidence"."claims"."assurance" is null or "evidence"."claims"."assurance" in ('identity_reviewed', 'domain_or_account_controlled', 'signed_provenance_validated', 'creator_declared_ai_use', 'agent_action_observed', 'outcome_confirmed', 'research_claim_assessed')),
	CONSTRAINT "claims_content_hash_ck" CHECK ("evidence"."claims"."content_hash" is null or "evidence"."claims"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "claims_inferred_unlabeled_ck" CHECK ("evidence"."claims"."capture_method" <> 'inferred' or "evidence"."claims"."assurance" is null),
	CONSTRAINT "claims_status_ck" CHECK ("evidence"."claims"."status" in ('open', 'supported', 'contested', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "trust"."identity_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_subject_id" text,
	"visibility" text DEFAULT 'tenant' NOT NULL,
	"source_provider" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"asserted_by_subject_id" text,
	"observed_by_subject_id" text,
	"capture_method" text NOT NULL,
	"validation_mechanism" text,
	"assurance" text,
	"limitations" text,
	"content_hash" text,
	"signature" text,
	"revoked_at" timestamp with time zone,
	"subject_id" text NOT NULL,
	"claim_type" text NOT NULL,
	"value" text NOT NULL,
	"superseded_by_id" text,
	CONSTRAINT "identity_claims_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "identity_claims_id_ck" CHECK ("trust"."identity_claims"."id" ~ '^idc_[0-9a-hjkmnp-tv-z]{26}$'),
	CONSTRAINT "identity_claims_schema_version_ck" CHECK ("trust"."identity_claims"."schema_version" > 0),
	CONSTRAINT "identity_claims_visibility_ck" CHECK ("trust"."identity_claims"."visibility" in ('private', 'tenant', 'public')),
	CONSTRAINT "identity_claims_capture_method_ck" CHECK ("trust"."identity_claims"."capture_method" in ('manual', 'import', 'api', 'instrumentation', 'challenge', 'c2pa', 'inferred')),
	CONSTRAINT "identity_claims_assurance_ck" CHECK ("trust"."identity_claims"."assurance" is null or "trust"."identity_claims"."assurance" in ('identity_reviewed', 'domain_or_account_controlled', 'signed_provenance_validated', 'creator_declared_ai_use', 'agent_action_observed', 'outcome_confirmed', 'research_claim_assessed')),
	CONSTRAINT "identity_claims_content_hash_ck" CHECK ("trust"."identity_claims"."content_hash" is null or "trust"."identity_claims"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "identity_claims_inferred_unlabeled_ck" CHECK ("trust"."identity_claims"."capture_method" <> 'inferred' or "trust"."identity_claims"."assurance" is null)
);
--> statement-breakpoint
CREATE TABLE "core"."objects" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "objects_tenant_id_kind_uq" UNIQUE("tenant_id","id","kind"),
	CONSTRAINT "objects_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "objects_kind_ck" CHECK ("core"."objects"."kind" in ('subject', 'identity_claim', 'work', 'work_version', 'artifact', 'source', 'claim', 'agent_run', 'tool_action', 'approval', 'provenance_assertion', 'relation'))
);
--> statement-breakpoint
CREATE TABLE "core"."outbox_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid,
	"type" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"subject_ref" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"correlation_id" text,
	"causation_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_by" text,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "outbox_events_id_ck" CHECK ("core"."outbox_events"."id" ~ '^evt_[0-9a-hjkmnp-tv-z]{26}$'),
	CONSTRAINT "outbox_events_type_ck" CHECK ("core"."outbox_events"."type" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
	CONSTRAINT "outbox_events_status_ck" CHECK ("core"."outbox_events"."status" in ('pending', 'delivered', 'dead'))
);
--> statement-breakpoint
CREATE TABLE "core"."outbox_receipts" (
	"event_id" text NOT NULL,
	"consumer" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_receipts_pk" PRIMARY KEY("event_id","consumer")
);
--> statement-breakpoint
CREATE TABLE "trust"."provenance_assertions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_subject_id" text,
	"visibility" text DEFAULT 'tenant' NOT NULL,
	"source_provider" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"asserted_by_subject_id" text,
	"observed_by_subject_id" text,
	"capture_method" text NOT NULL,
	"validation_mechanism" text,
	"assurance" text,
	"limitations" text,
	"content_hash" text,
	"signature" text,
	"revoked_at" timestamp with time zone,
	"target_id" text NOT NULL,
	"assertion_type" text NOT NULL,
	"statement" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"signer_key_id" text,
	CONSTRAINT "provenance_assertions_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "provenance_assertions_id_ck" CHECK ("trust"."provenance_assertions"."id" ~ '^pas_[0-9a-hjkmnp-tv-z]{26}$'),
	CONSTRAINT "provenance_assertions_schema_version_ck" CHECK ("trust"."provenance_assertions"."schema_version" > 0),
	CONSTRAINT "provenance_assertions_visibility_ck" CHECK ("trust"."provenance_assertions"."visibility" in ('private', 'tenant', 'public')),
	CONSTRAINT "provenance_assertions_capture_method_ck" CHECK ("trust"."provenance_assertions"."capture_method" in ('manual', 'import', 'api', 'instrumentation', 'challenge', 'c2pa', 'inferred')),
	CONSTRAINT "provenance_assertions_assurance_ck" CHECK ("trust"."provenance_assertions"."assurance" is null or "trust"."provenance_assertions"."assurance" in ('identity_reviewed', 'domain_or_account_controlled', 'signed_provenance_validated', 'creator_declared_ai_use', 'agent_action_observed', 'outcome_confirmed', 'research_claim_assessed')),
	CONSTRAINT "provenance_assertions_content_hash_ck" CHECK ("trust"."provenance_assertions"."content_hash" is null or "trust"."provenance_assertions"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "provenance_assertions_inferred_unlabeled_ck" CHECK ("trust"."provenance_assertions"."capture_method" <> 'inferred' or "trust"."provenance_assertions"."assurance" is null),
	CONSTRAINT "provenance_assertions_type_ck" CHECK ("trust"."provenance_assertions"."assertion_type" in ('authorship', 'ai_use_declaration', 'c2pa_manifest', 'signed_receipt')),
	CONSTRAINT "provenance_assertions_signed_ck" CHECK (("trust"."provenance_assertions"."signature" is null) = ("trust"."provenance_assertions"."signer_key_id" is null))
);
--> statement-breakpoint
CREATE TABLE "core"."relation_rules" (
	"type" text NOT NULL,
	"from_kind" text NOT NULL,
	"to_kind" text NOT NULL,
	"description" text,
	CONSTRAINT "relation_rules_pk" PRIMARY KEY("type","from_kind","to_kind")
);
--> statement-breakpoint
CREATE TABLE "core"."relations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_subject_id" text,
	"visibility" text DEFAULT 'tenant' NOT NULL,
	"source_provider" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"asserted_by_subject_id" text,
	"observed_by_subject_id" text,
	"capture_method" text NOT NULL,
	"validation_mechanism" text,
	"assurance" text,
	"limitations" text,
	"content_hash" text,
	"signature" text,
	"revoked_at" timestamp with time zone,
	"type" text NOT NULL,
	"from_id" text NOT NULL,
	"from_kind" text NOT NULL,
	"to_id" text NOT NULL,
	"to_kind" text NOT NULL,
	"review_state" text,
	"superseded_by_id" text,
	CONSTRAINT "relations_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "relations_id_ck" CHECK ("core"."relations"."id" ~ '^rel_[0-9a-hjkmnp-tv-z]{26}$'),
	CONSTRAINT "relations_schema_version_ck" CHECK ("core"."relations"."schema_version" > 0),
	CONSTRAINT "relations_visibility_ck" CHECK ("core"."relations"."visibility" in ('private', 'tenant', 'public')),
	CONSTRAINT "relations_capture_method_ck" CHECK ("core"."relations"."capture_method" in ('manual', 'import', 'api', 'instrumentation', 'challenge', 'c2pa', 'inferred')),
	CONSTRAINT "relations_assurance_ck" CHECK ("core"."relations"."assurance" is null or "core"."relations"."assurance" in ('identity_reviewed', 'domain_or_account_controlled', 'signed_provenance_validated', 'creator_declared_ai_use', 'agent_action_observed', 'outcome_confirmed', 'research_claim_assessed')),
	CONSTRAINT "relations_content_hash_ck" CHECK ("core"."relations"."content_hash" is null or "core"."relations"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "relations_inferred_unlabeled_ck" CHECK ("core"."relations"."capture_method" <> 'inferred' or "core"."relations"."assurance" is null),
	CONSTRAINT "relations_no_self_ck" CHECK ("core"."relations"."from_id" <> "core"."relations"."to_id"),
	CONSTRAINT "relations_review_ck" CHECK (("core"."relations"."capture_method" = 'inferred') = ("core"."relations"."review_state" is not null))
);
--> statement-breakpoint
CREATE TABLE "evidence"."sources" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_subject_id" text,
	"visibility" text DEFAULT 'tenant' NOT NULL,
	"source_provider" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"asserted_by_subject_id" text,
	"observed_by_subject_id" text,
	"capture_method" text NOT NULL,
	"validation_mechanism" text,
	"assurance" text,
	"limitations" text,
	"content_hash" text,
	"signature" text,
	"revoked_at" timestamp with time zone,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"doi" text,
	"retrieved_at" timestamp with time zone,
	CONSTRAINT "sources_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "sources_id_ck" CHECK ("evidence"."sources"."id" ~ '^src_[0-9a-hjkmnp-tv-z]{26}$'),
	CONSTRAINT "sources_schema_version_ck" CHECK ("evidence"."sources"."schema_version" > 0),
	CONSTRAINT "sources_visibility_ck" CHECK ("evidence"."sources"."visibility" in ('private', 'tenant', 'public')),
	CONSTRAINT "sources_capture_method_ck" CHECK ("evidence"."sources"."capture_method" in ('manual', 'import', 'api', 'instrumentation', 'challenge', 'c2pa', 'inferred')),
	CONSTRAINT "sources_assurance_ck" CHECK ("evidence"."sources"."assurance" is null or "evidence"."sources"."assurance" in ('identity_reviewed', 'domain_or_account_controlled', 'signed_provenance_validated', 'creator_declared_ai_use', 'agent_action_observed', 'outcome_confirmed', 'research_claim_assessed')),
	CONSTRAINT "sources_content_hash_ck" CHECK ("evidence"."sources"."content_hash" is null or "evidence"."sources"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "sources_inferred_unlabeled_ck" CHECK ("evidence"."sources"."capture_method" <> 'inferred' or "evidence"."sources"."assurance" is null),
	CONSTRAINT "sources_kind_ck" CHECK ("evidence"."sources"."kind" in ('paper', 'web', 'dataset', 'book', 'repository', 'other'))
);
--> statement-breakpoint
CREATE TABLE "trust"."subjects" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_subject_id" text,
	"kind" text NOT NULL,
	"display_name" text NOT NULL,
	"user_id" uuid,
	"agent_id" uuid,
	CONSTRAINT "subjects_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "subjects_tenant_id_kind_uq" UNIQUE("tenant_id","id","kind"),
	CONSTRAINT "subjects_id_ck" CHECK ("trust"."subjects"."id" ~ '^sub_[0-9a-hjkmnp-tv-z]{26}$'),
	CONSTRAINT "subjects_schema_version_ck" CHECK ("trust"."subjects"."schema_version" > 0),
	CONSTRAINT "subjects_kind_ck" CHECK ("trust"."subjects"."kind" in ('human', 'organization', 'agent', 'service')),
	CONSTRAINT "subjects_agent_link_ck" CHECK (("trust"."subjects"."kind" = 'agent') = ("trust"."subjects"."agent_id" is not null)),
	CONSTRAINT "subjects_user_link_ck" CHECK ("trust"."subjects"."kind" = 'human' or "trust"."subjects"."user_id" is null)
);
--> statement-breakpoint
CREATE TABLE "agents"."tool_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_subject_id" text,
	"visibility" text DEFAULT 'tenant' NOT NULL,
	"source_provider" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"asserted_by_subject_id" text,
	"observed_by_subject_id" text,
	"capture_method" text NOT NULL,
	"validation_mechanism" text,
	"assurance" text,
	"limitations" text,
	"content_hash" text,
	"signature" text,
	"revoked_at" timestamp with time zone,
	"run_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"idempotency_key" text NOT NULL,
	"input_hash" text,
	"outcome_confirmed_at" timestamp with time zone,
	CONSTRAINT "tool_actions_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "tool_actions_idempotency_uq" UNIQUE("tenant_id","idempotency_key"),
	CONSTRAINT "tool_actions_id_ck" CHECK ("agents"."tool_actions"."id" ~ '^act_[0-9a-hjkmnp-tv-z]{26}$'),
	CONSTRAINT "tool_actions_schema_version_ck" CHECK ("agents"."tool_actions"."schema_version" > 0),
	CONSTRAINT "tool_actions_visibility_ck" CHECK ("agents"."tool_actions"."visibility" in ('private', 'tenant', 'public')),
	CONSTRAINT "tool_actions_capture_method_ck" CHECK ("agents"."tool_actions"."capture_method" in ('manual', 'import', 'api', 'instrumentation', 'challenge', 'c2pa', 'inferred')),
	CONSTRAINT "tool_actions_assurance_ck" CHECK ("agents"."tool_actions"."assurance" is null or "agents"."tool_actions"."assurance" in ('identity_reviewed', 'domain_or_account_controlled', 'signed_provenance_validated', 'creator_declared_ai_use', 'agent_action_observed', 'outcome_confirmed', 'research_claim_assessed')),
	CONSTRAINT "tool_actions_content_hash_ck" CHECK ("agents"."tool_actions"."content_hash" is null or "agents"."tool_actions"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "tool_actions_inferred_unlabeled_ck" CHECK ("agents"."tool_actions"."capture_method" <> 'inferred' or "agents"."tool_actions"."assurance" is null),
	CONSTRAINT "tool_actions_status_ck" CHECK ("agents"."tool_actions"."status" in ('proposed', 'awaiting_approval', 'approved', 'rejected', 'executed', 'failed')),
	CONSTRAINT "tool_actions_input_hash_ck" CHECK ("agents"."tool_actions"."input_hash" is null or "agents"."tool_actions"."input_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "content"."work_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_subject_id" text,
	"visibility" text DEFAULT 'tenant' NOT NULL,
	"source_provider" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"asserted_by_subject_id" text,
	"observed_by_subject_id" text,
	"capture_method" text NOT NULL,
	"validation_mechanism" text,
	"assurance" text,
	"limitations" text,
	"content_hash" text,
	"signature" text,
	"revoked_at" timestamp with time zone,
	"work_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"normalized_text_hash" text,
	"note" text,
	CONSTRAINT "work_versions_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "work_versions_number_uq" UNIQUE("work_id","version_number"),
	CONSTRAINT "work_versions_id_ck" CHECK ("content"."work_versions"."id" ~ '^wkv_[0-9a-hjkmnp-tv-z]{26}$'),
	CONSTRAINT "work_versions_schema_version_ck" CHECK ("content"."work_versions"."schema_version" > 0),
	CONSTRAINT "work_versions_visibility_ck" CHECK ("content"."work_versions"."visibility" in ('private', 'tenant', 'public')),
	CONSTRAINT "work_versions_capture_method_ck" CHECK ("content"."work_versions"."capture_method" in ('manual', 'import', 'api', 'instrumentation', 'challenge', 'c2pa', 'inferred')),
	CONSTRAINT "work_versions_assurance_ck" CHECK ("content"."work_versions"."assurance" is null or "content"."work_versions"."assurance" in ('identity_reviewed', 'domain_or_account_controlled', 'signed_provenance_validated', 'creator_declared_ai_use', 'agent_action_observed', 'outcome_confirmed', 'research_claim_assessed')),
	CONSTRAINT "work_versions_content_hash_ck" CHECK ("content"."work_versions"."content_hash" is null or "content"."work_versions"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "work_versions_inferred_unlabeled_ck" CHECK ("content"."work_versions"."capture_method" <> 'inferred' or "content"."work_versions"."assurance" is null),
	CONSTRAINT "work_versions_number_ck" CHECK ("content"."work_versions"."version_number" > 0),
	CONSTRAINT "work_versions_normalized_hash_ck" CHECK ("content"."work_versions"."normalized_text_hash" is null or "content"."work_versions"."normalized_text_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "content"."works" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_subject_id" text,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"owner_subject_id" text NOT NULL,
	CONSTRAINT "works_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "works_id_ck" CHECK ("content"."works"."id" ~ '^wrk_[0-9a-hjkmnp-tv-z]{26}$'),
	CONSTRAINT "works_schema_version_ck" CHECK ("content"."works"."schema_version" > 0),
	CONSTRAINT "works_status_ck" CHECK ("content"."works"."status" in ('draft', 'published', 'archived'))
);
--> statement-breakpoint
ALTER TABLE "core"."audit_events" ADD COLUMN "seq" bigint;--> statement-breakpoint
ALTER TABLE "core"."audit_events" ADD COLUMN "prev_hash" text;--> statement-breakpoint
ALTER TABLE "core"."audit_events" ADD COLUMN "hash" text;--> statement-breakpoint
ALTER TABLE "agents"."agent_runs" ADD CONSTRAINT "agent_runs_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "core"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents"."agent_runs" ADD CONSTRAINT "agent_runs_created_by_fk" FOREIGN KEY ("tenant_id","created_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents"."agent_runs" ADD CONSTRAINT "agent_runs_asserted_by_fk" FOREIGN KEY ("tenant_id","asserted_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents"."agent_runs" ADD CONSTRAINT "agent_runs_observed_by_fk" FOREIGN KEY ("tenant_id","observed_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents"."agent_runs" ADD CONSTRAINT "agent_runs_agent_fk" FOREIGN KEY ("tenant_id","agent_subject_id","agent_subject_kind") REFERENCES "trust"."subjects"("tenant_id","id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents"."approvals" ADD CONSTRAINT "approvals_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "core"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents"."approvals" ADD CONSTRAINT "approvals_created_by_fk" FOREIGN KEY ("tenant_id","created_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents"."approvals" ADD CONSTRAINT "approvals_action_fk" FOREIGN KEY ("tenant_id","action_id") REFERENCES "agents"."tool_actions"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents"."approvals" ADD CONSTRAINT "approvals_decided_by_fk" FOREIGN KEY ("tenant_id","decided_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."artifacts" ADD CONSTRAINT "artifacts_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "core"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."artifacts" ADD CONSTRAINT "artifacts_created_by_fk" FOREIGN KEY ("tenant_id","created_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."artifacts" ADD CONSTRAINT "artifacts_asserted_by_fk" FOREIGN KEY ("tenant_id","asserted_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."artifacts" ADD CONSTRAINT "artifacts_observed_by_fk" FOREIGN KEY ("tenant_id","observed_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."artifacts" ADD CONSTRAINT "artifacts_work_version_fk" FOREIGN KEY ("tenant_id","work_version_id") REFERENCES "content"."work_versions"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence"."claims" ADD CONSTRAINT "claims_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "core"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence"."claims" ADD CONSTRAINT "claims_created_by_fk" FOREIGN KEY ("tenant_id","created_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence"."claims" ADD CONSTRAINT "claims_asserted_by_fk" FOREIGN KEY ("tenant_id","asserted_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence"."claims" ADD CONSTRAINT "claims_observed_by_fk" FOREIGN KEY ("tenant_id","observed_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence"."claims" ADD CONSTRAINT "claims_superseded_by_fk" FOREIGN KEY ("tenant_id","superseded_by_id") REFERENCES "evidence"."claims"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."identity_claims" ADD CONSTRAINT "identity_claims_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "core"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."identity_claims" ADD CONSTRAINT "identity_claims_created_by_fk" FOREIGN KEY ("tenant_id","created_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."identity_claims" ADD CONSTRAINT "identity_claims_asserted_by_fk" FOREIGN KEY ("tenant_id","asserted_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."identity_claims" ADD CONSTRAINT "identity_claims_observed_by_fk" FOREIGN KEY ("tenant_id","observed_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."identity_claims" ADD CONSTRAINT "identity_claims_subject_fk" FOREIGN KEY ("tenant_id","subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."identity_claims" ADD CONSTRAINT "identity_claims_superseded_by_fk" FOREIGN KEY ("tenant_id","superseded_by_id") REFERENCES "trust"."identity_claims"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."objects" ADD CONSTRAINT "objects_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "core"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."outbox_events" ADD CONSTRAINT "outbox_events_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "core"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."outbox_receipts" ADD CONSTRAINT "outbox_receipts_event_id_outbox_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "core"."outbox_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."provenance_assertions" ADD CONSTRAINT "provenance_assertions_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "core"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."provenance_assertions" ADD CONSTRAINT "provenance_assertions_created_by_fk" FOREIGN KEY ("tenant_id","created_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."provenance_assertions" ADD CONSTRAINT "provenance_assertions_asserted_by_fk" FOREIGN KEY ("tenant_id","asserted_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."provenance_assertions" ADD CONSTRAINT "provenance_assertions_observed_by_fk" FOREIGN KEY ("tenant_id","observed_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."provenance_assertions" ADD CONSTRAINT "provenance_assertions_target_fk" FOREIGN KEY ("tenant_id","target_id") REFERENCES "core"."objects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."relations" ADD CONSTRAINT "relations_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "core"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."relations" ADD CONSTRAINT "relations_created_by_fk" FOREIGN KEY ("tenant_id","created_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."relations" ADD CONSTRAINT "relations_asserted_by_fk" FOREIGN KEY ("tenant_id","asserted_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."relations" ADD CONSTRAINT "relations_observed_by_fk" FOREIGN KEY ("tenant_id","observed_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."relations" ADD CONSTRAINT "relations_rule_fk" FOREIGN KEY ("type","from_kind","to_kind") REFERENCES "core"."relation_rules"("type","from_kind","to_kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."relations" ADD CONSTRAINT "relations_from_fk" FOREIGN KEY ("tenant_id","from_id","from_kind") REFERENCES "core"."objects"("tenant_id","id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."relations" ADD CONSTRAINT "relations_to_fk" FOREIGN KEY ("tenant_id","to_id","to_kind") REFERENCES "core"."objects"("tenant_id","id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."relations" ADD CONSTRAINT "relations_superseded_by_fk" FOREIGN KEY ("tenant_id","superseded_by_id") REFERENCES "core"."relations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence"."sources" ADD CONSTRAINT "sources_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "core"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence"."sources" ADD CONSTRAINT "sources_created_by_fk" FOREIGN KEY ("tenant_id","created_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence"."sources" ADD CONSTRAINT "sources_asserted_by_fk" FOREIGN KEY ("tenant_id","asserted_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence"."sources" ADD CONSTRAINT "sources_observed_by_fk" FOREIGN KEY ("tenant_id","observed_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."subjects" ADD CONSTRAINT "subjects_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "core"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."subjects" ADD CONSTRAINT "subjects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."subjects" ADD CONSTRAINT "subjects_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "core"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."subjects" ADD CONSTRAINT "subjects_created_by_fk" FOREIGN KEY ("tenant_id","created_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents"."tool_actions" ADD CONSTRAINT "tool_actions_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "core"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents"."tool_actions" ADD CONSTRAINT "tool_actions_created_by_fk" FOREIGN KEY ("tenant_id","created_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents"."tool_actions" ADD CONSTRAINT "tool_actions_asserted_by_fk" FOREIGN KEY ("tenant_id","asserted_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents"."tool_actions" ADD CONSTRAINT "tool_actions_observed_by_fk" FOREIGN KEY ("tenant_id","observed_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents"."tool_actions" ADD CONSTRAINT "tool_actions_run_fk" FOREIGN KEY ("tenant_id","run_id") REFERENCES "agents"."agent_runs"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."work_versions" ADD CONSTRAINT "work_versions_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "core"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."work_versions" ADD CONSTRAINT "work_versions_created_by_fk" FOREIGN KEY ("tenant_id","created_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."work_versions" ADD CONSTRAINT "work_versions_asserted_by_fk" FOREIGN KEY ("tenant_id","asserted_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."work_versions" ADD CONSTRAINT "work_versions_observed_by_fk" FOREIGN KEY ("tenant_id","observed_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."work_versions" ADD CONSTRAINT "work_versions_work_fk" FOREIGN KEY ("tenant_id","work_id") REFERENCES "content"."works"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."works" ADD CONSTRAINT "works_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "core"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."works" ADD CONSTRAINT "works_created_by_fk" FOREIGN KEY ("tenant_id","created_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."works" ADD CONSTRAINT "works_owner_fk" FOREIGN KEY ("tenant_id","owner_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_agent_idx" ON "agents"."agent_runs" USING btree ("tenant_id","agent_subject_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_one_pending_uq" ON "agents"."approvals" USING btree ("action_id") WHERE "agents"."approvals"."decision" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "artifacts_storage_key_uq" ON "content"."artifacts" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "identity_claims_subject_idx" ON "trust"."identity_claims" USING btree ("tenant_id","subject_id");--> statement-breakpoint
CREATE INDEX "outbox_events_ready_idx" ON "core"."outbox_events" USING btree ("available_at") WHERE "core"."outbox_events"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "provenance_assertions_target_idx" ON "trust"."provenance_assertions" USING btree ("tenant_id","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "relations_live_uq" ON "core"."relations" USING btree ("tenant_id","type","from_id","to_id") WHERE "core"."relations"."revoked_at" is null and "core"."relations"."superseded_by_id" is null;--> statement-breakpoint
CREATE INDEX "relations_to_idx" ON "core"."relations" USING btree ("tenant_id","to_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_tenant_doi_uq" ON "evidence"."sources" USING btree ("tenant_id","doi");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_tenant_user_uq" ON "trust"."subjects" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_agent_uq" ON "trust"."subjects" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_events_tenant_seq_uq" ON "core"."audit_events" USING btree ("tenant_id","seq");