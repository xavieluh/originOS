CREATE TABLE "core"."integration_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"account_id" text NOT NULL,
	"account_label" text NOT NULL,
	"granted_scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"access_token_sealed" text,
	"refresh_token_sealed" text,
	"token_key_id" text,
	"token_expires_at" timestamp with time zone,
	"connected_by_user_id" uuid,
	"last_checked_at" timestamp with time zone,
	"last_error" text,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_connections_id_ck" CHECK ("core"."integration_connections"."id" ~ '^con_[0-9a-hjkmnp-tv-z]{26}$'),
	CONSTRAINT "integration_connections_provider_ck" CHECK ("core"."integration_connections"."provider" ~ '^[a-z][a-z0-9-]{1,39}$'),
	CONSTRAINT "integration_connections_status_ck" CHECK ("core"."integration_connections"."status" in ('connected', 'degraded', 'revoked')),
	CONSTRAINT "integration_connections_revoked_ck" CHECK (("core"."integration_connections"."status" = 'revoked') = ("core"."integration_connections"."revoked_at" is not null)),
	CONSTRAINT "integration_connections_token_ck" CHECK ("core"."integration_connections"."status" = 'revoked' or "core"."integration_connections"."access_token_sealed" is not null)
);
--> statement-breakpoint
CREATE TABLE "core"."oauth_states" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"code_verifier" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"scopes" text[] NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_states_hash_ck" CHECK ("core"."oauth_states"."state_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "core"."webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"connection_id" text NOT NULL,
	"provider" text NOT NULL,
	"delivery_id" text NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_sha256" text NOT NULL,
	"byte_size" integer NOT NULL,
	"correlation_id" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_deliveries_id_ck" CHECK ("core"."webhook_deliveries"."id" ~ '^whd_[0-9a-hjkmnp-tv-z]{26}$'),
	CONSTRAINT "webhook_deliveries_sha256_ck" CHECK ("core"."webhook_deliveries"."payload_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "core"."integration_connections" ADD CONSTRAINT "integration_connections_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "core"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."integration_connections" ADD CONSTRAINT "integration_connections_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."integration_connections" ADD CONSTRAINT "integration_connections_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."oauth_states" ADD CONSTRAINT "oauth_states_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "core"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."oauth_states" ADD CONSTRAINT "oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "core"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_connection_id_integration_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "core"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connections_account_uq" ON "core"."integration_connections" USING btree ("tenant_id","provider","account_id") WHERE "core"."integration_connections"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "integration_connections_tenant_idx" ON "core"."integration_connections" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "oauth_states_expires_idx" ON "core"."oauth_states" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_delivery_uq" ON "core"."webhook_deliveries" USING btree ("provider","delivery_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_connection_idx" ON "core"."webhook_deliveries" USING btree ("connection_id","received_at");