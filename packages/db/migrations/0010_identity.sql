CREATE TABLE "trust"."identity_proofs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"profile_id" text NOT NULL,
	"kind" text NOT NULL,
	"method" text NOT NULL,
	"target" text NOT NULL,
	"provider" text,
	"label" text NOT NULL,
	"challenge" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"first_verified_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"last_check_error" text,
	"check_count" integer DEFAULT 0 NOT NULL,
	"stale_reason" text,
	"stale_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"revoked_by_user_id" uuid,
	"claim_id" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_proofs_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "identity_proofs_id_ck" CHECK ("trust"."identity_proofs"."id" ~ '^prv_[0-9a-hjkmnp-tv-z]{26}$'),
	CONSTRAINT "identity_proofs_kind_ck" CHECK ("trust"."identity_proofs"."kind" in ('domain', 'account')),
	CONSTRAINT "identity_proofs_method_ck" CHECK ("trust"."identity_proofs"."method" in ('dns_txt', 'html_file', 'oauth')),
	CONSTRAINT "identity_proofs_status_ck" CHECK ("trust"."identity_proofs"."status" in ('pending', 'verified', 'stale', 'revoked')),
	CONSTRAINT "identity_proofs_visibility_ck" CHECK ("trust"."identity_proofs"."visibility" in ('public', 'tenant')),
	CONSTRAINT "identity_proofs_method_kind_ck" CHECK (("trust"."identity_proofs"."kind" = 'domain' and "trust"."identity_proofs"."method" in ('dns_txt', 'html_file') and "trust"."identity_proofs"."challenge" is not null and "trust"."identity_proofs"."provider" is null)
        or ("trust"."identity_proofs"."kind" = 'account' and "trust"."identity_proofs"."method" = 'oauth' and "trust"."identity_proofs"."challenge" is null and "trust"."identity_proofs"."provider" is not null)),
	CONSTRAINT "identity_proofs_verified_ck" CHECK ("trust"."identity_proofs"."status" = 'pending' or ("trust"."identity_proofs"."last_verified_at" is not null and "trust"."identity_proofs"."expires_at" is not null and "trust"."identity_proofs"."claim_id" is not null)
        or "trust"."identity_proofs"."status" = 'revoked'),
	CONSTRAINT "identity_proofs_revoked_ck" CHECK (("trust"."identity_proofs"."status" = 'revoked') = ("trust"."identity_proofs"."revoked_at" is not null and "trust"."identity_proofs"."revoked_reason" is not null)),
	CONSTRAINT "identity_proofs_stale_ck" CHECK ("trust"."identity_proofs"."status" <> 'stale' or "trust"."identity_proofs"."stale_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "trust"."identity_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"profile_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"claim_type" text,
	"ownership_reason" text,
	"statement" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_hash" text NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"requested_by_user_id" uuid,
	"requested_by_subject_id" text NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"claim_id" text,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"revoked_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_reviews_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "identity_reviews_id_ck" CHECK ("trust"."identity_reviews"."id" ~ '^rvw_[0-9a-hjkmnp-tv-z]{26}$'),
	CONSTRAINT "identity_reviews_kind_ck" CHECK ("trust"."identity_reviews"."kind" in ('claim', 'ownership')),
	CONSTRAINT "identity_reviews_status_ck" CHECK ("trust"."identity_reviews"."status" in ('pending', 'approved', 'rejected', 'withdrawn', 'revoked')),
	CONSTRAINT "identity_reviews_visibility_ck" CHECK ("trust"."identity_reviews"."visibility" in ('public', 'tenant')),
	CONSTRAINT "identity_reviews_kind_fields_ck" CHECK (("trust"."identity_reviews"."kind" = 'claim' and "trust"."identity_reviews"."claim_type" is not null and "trust"."identity_reviews"."ownership_reason" is null)
        or ("trust"."identity_reviews"."kind" = 'ownership' and "trust"."identity_reviews"."ownership_reason" is not null and "trust"."identity_reviews"."claim_type" is null)),
	CONSTRAINT "identity_reviews_hash_ck" CHECK ("trust"."identity_reviews"."evidence_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "identity_reviews_decided_ck" CHECK (("trust"."identity_reviews"."status" in ('approved', 'rejected', 'revoked')) = ("trust"."identity_reviews"."decided_at" is not null)
        and ("trust"."identity_reviews"."decided_at" is null or "trust"."identity_reviews"."decision_reason" is not null)),
	CONSTRAINT "identity_reviews_separation_ck" CHECK ("trust"."identity_reviews"."decided_by_user_id" is null or "trust"."identity_reviews"."requested_by_user_id" is null or "trust"."identity_reviews"."decided_by_user_id" <> "trust"."identity_reviews"."requested_by_user_id"),
	CONSTRAINT "identity_reviews_revoked_ck" CHECK (("trust"."identity_reviews"."status" = 'revoked') = ("trust"."identity_reviews"."revoked_at" is not null and "trust"."identity_reviews"."revoked_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "trust"."profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subject_id" text NOT NULL,
	"kind" text NOT NULL,
	"handle" text NOT NULL,
	"display_name" text NOT NULL,
	"bio" text,
	"visibility" text DEFAULT 'tenant' NOT NULL,
	"pseudonymous" boolean DEFAULT false NOT NULL,
	"discoverable" boolean DEFAULT true NOT NULL,
	"moderation_state" text DEFAULT 'active' NOT NULL,
	"moderation_reason" text,
	"moderated_at" timestamp with time zone,
	"moderated_by_user_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "profiles_id_ck" CHECK ("trust"."profiles"."id" ~ '^prf_[0-9a-hjkmnp-tv-z]{26}$'),
	CONSTRAINT "profiles_kind_ck" CHECK ("trust"."profiles"."kind" in ('creator', 'organization')),
	CONSTRAINT "profiles_visibility_ck" CHECK ("trust"."profiles"."visibility" in ('private', 'tenant', 'public')),
	CONSTRAINT "profiles_moderation_ck" CHECK ("trust"."profiles"."moderation_state" in ('active', 'hidden', 'suspended')),
	CONSTRAINT "profiles_handle_ck" CHECK ("trust"."profiles"."handle" ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$' and position('--' in "trust"."profiles"."handle") = 0),
	CONSTRAINT "profiles_text_ck" CHECK (char_length("trust"."profiles"."display_name") between 1 and 80 and ("trust"."profiles"."bio" is null or char_length("trust"."profiles"."bio") <= 500)),
	CONSTRAINT "profiles_moderation_reason_ck" CHECK ("trust"."profiles"."moderation_state" = 'active' or "trust"."profiles"."moderation_reason" is not null)
);
--> statement-breakpoint
ALTER TABLE "core"."oauth_states" ADD COLUMN "purpose" text DEFAULT 'connect' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."oauth_states" ADD COLUMN "profile_id" text;--> statement-breakpoint
ALTER TABLE "trust"."identity_proofs" ADD CONSTRAINT "identity_proofs_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "core"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."identity_proofs" ADD CONSTRAINT "identity_proofs_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."identity_proofs" ADD CONSTRAINT "identity_proofs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."identity_proofs" ADD CONSTRAINT "identity_proofs_profile_fk" FOREIGN KEY ("tenant_id","profile_id") REFERENCES "trust"."profiles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."identity_proofs" ADD CONSTRAINT "identity_proofs_claim_fk" FOREIGN KEY ("tenant_id","claim_id") REFERENCES "trust"."identity_claims"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."identity_reviews" ADD CONSTRAINT "identity_reviews_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "core"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."identity_reviews" ADD CONSTRAINT "identity_reviews_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."identity_reviews" ADD CONSTRAINT "identity_reviews_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."identity_reviews" ADD CONSTRAINT "identity_reviews_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."identity_reviews" ADD CONSTRAINT "identity_reviews_profile_fk" FOREIGN KEY ("tenant_id","profile_id") REFERENCES "trust"."profiles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."identity_reviews" ADD CONSTRAINT "identity_reviews_requester_fk" FOREIGN KEY ("tenant_id","requested_by_subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."identity_reviews" ADD CONSTRAINT "identity_reviews_claim_fk" FOREIGN KEY ("tenant_id","claim_id") REFERENCES "trust"."identity_claims"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."profiles" ADD CONSTRAINT "profiles_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "core"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."profiles" ADD CONSTRAINT "profiles_moderated_by_user_id_users_id_fk" FOREIGN KEY ("moderated_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."profiles" ADD CONSTRAINT "profiles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust"."profiles" ADD CONSTRAINT "profiles_subject_fk" FOREIGN KEY ("tenant_id","subject_id") REFERENCES "trust"."subjects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "identity_proofs_live_uq" ON "trust"."identity_proofs" USING btree ("profile_id","kind","target") WHERE "trust"."identity_proofs"."status" <> 'revoked';--> statement-breakpoint
CREATE INDEX "identity_proofs_target_idx" ON "trust"."identity_proofs" USING btree ("kind","target");--> statement-breakpoint
CREATE INDEX "identity_proofs_expiry_idx" ON "trust"."identity_proofs" USING btree ("expires_at") WHERE "trust"."identity_proofs"."status" = 'verified';--> statement-breakpoint
CREATE INDEX "identity_reviews_queue_idx" ON "trust"."identity_reviews" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_reviews_open_ownership_uq" ON "trust"."identity_reviews" USING btree ("profile_id","requested_by_subject_id") WHERE "trust"."identity_reviews"."kind" = 'ownership' and "trust"."identity_reviews"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_handle_uq" ON "trust"."profiles" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "profiles_subject_idx" ON "trust"."profiles" USING btree ("tenant_id","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_one_org_profile_uq" ON "trust"."profiles" USING btree ("tenant_id") WHERE "trust"."profiles"."kind" = 'organization';--> statement-breakpoint
ALTER TABLE "core"."oauth_states" ADD CONSTRAINT "oauth_states_purpose_ck" CHECK (("core"."oauth_states"."purpose" = 'connect' and "core"."oauth_states"."profile_id" is null) or ("core"."oauth_states"."purpose" = 'identity_proof' and "core"."oauth_states"."profile_id" is not null));