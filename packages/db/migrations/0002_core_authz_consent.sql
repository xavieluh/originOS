CREATE TABLE "core"."agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"owner_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"disabled_at" timestamp with time zone,
	"disabled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_status_ck" CHECK ("core"."agents"."status" in ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "core"."consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"user_id" uuid,
	"purpose" text NOT NULL,
	"scope_key" text DEFAULT '' NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"policy_version" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	CONSTRAINT "consents_subject_ck" CHECK (("core"."consents"."subject_type" = 'user' and "core"."consents"."user_id" is not null) or ("core"."consents"."subject_type" = 'organization' and "core"."consents"."user_id" is null)),
	CONSTRAINT "consents_purpose_ck" CHECK ("core"."consents"."purpose" in ('identity_directory', 'telemetry_collection', 'data_sharing', 'provider_scopes', 'cross_org_policy'))
);
--> statement-breakpoint
CREATE TABLE "core"."permission_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"effect" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"actions" text[] NOT NULL,
	"reason" text,
	"expires_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	CONSTRAINT "permission_grants_subject_type_ck" CHECK ("core"."permission_grants"."subject_type" in ('user', 'agent', 'service')),
	CONSTRAINT "permission_grants_effect_ck" CHECK ("core"."permission_grants"."effect" in ('allow', 'deny')),
	CONSTRAINT "permission_grants_actions_ck" CHECK (cardinality("core"."permission_grants"."actions") > 0 and "core"."permission_grants"."actions" <@ array['read','write','publish','export','admin']::text[])
);
--> statement-breakpoint
ALTER TABLE "core"."agents" ADD CONSTRAINT "agents_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "core"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."agents" ADD CONSTRAINT "agents_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."agents" ADD CONSTRAINT "agents_disabled_by_users_id_fk" FOREIGN KEY ("disabled_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."consents" ADD CONSTRAINT "consents_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "core"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."consents" ADD CONSTRAINT "consents_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."consents" ADD CONSTRAINT "consents_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."permission_grants" ADD CONSTRAINT "permission_grants_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "core"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."permission_grants" ADD CONSTRAINT "permission_grants_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."permission_grants" ADD CONSTRAINT "permission_grants_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agents_tenant_id_idx" ON "core"."agents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "consents_tenant_idx" ON "core"."consents" USING btree ("tenant_id","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "consents_one_active_uq" ON "core"."consents" USING btree ("tenant_id","subject_type",coalesce("user_id", '00000000-0000-0000-0000-000000000000'::uuid),"purpose","scope_key") WHERE "core"."consents"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "permission_grants_subject_idx" ON "core"."permission_grants" USING btree ("tenant_id","subject_type","subject_id");