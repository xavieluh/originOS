CREATE TABLE "core"."job_steps" (
	"job_id" text NOT NULL,
	"step" text NOT NULL,
	"output" jsonb,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_steps_pk" PRIMARY KEY("job_id","step")
);
--> statement-breakpoint
CREATE TABLE "core"."jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"subject_ref" text,
	"idempotency_key" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_by" text,
	"locked_until" timestamp with time zone,
	"progress" integer DEFAULT 0 NOT NULL,
	"progress_message" text,
	"last_error" text,
	"wait_reason" text,
	"resume_input" jsonb,
	"cancel_requested_at" timestamp with time zone,
	"cancel_requested_by" uuid,
	"result" jsonb,
	"created_by_user_id" uuid,
	"correlation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "jobs_id_ck" CHECK ("core"."jobs"."id" ~ '^job_[0-9a-hjkmnp-tv-z]{26}$'),
	CONSTRAINT "jobs_type_ck" CHECK ("core"."jobs"."type" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
	CONSTRAINT "jobs_status_ck" CHECK ("core"."jobs"."status" in ('pending', 'running', 'waiting', 'succeeded', 'cancelled', 'dead')),
	CONSTRAINT "jobs_attempts_ck" CHECK ("core"."jobs"."attempts" >= 0 and "core"."jobs"."max_attempts" between 1 and 50),
	CONSTRAINT "jobs_progress_ck" CHECK ("core"."jobs"."progress" between 0 and 100),
	CONSTRAINT "jobs_waiting_ck" CHECK (("core"."jobs"."status" = 'waiting') = ("core"."jobs"."wait_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "core"."uploads" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"uploaded_by_user_id" uuid,
	"filename" text NOT NULL,
	"declared_type" text NOT NULL,
	"detected_type" text,
	"byte_size" bigint NOT NULL,
	"sha256" text,
	"status" text DEFAULT 'quarantined' NOT NULL,
	"error_code" text,
	"error_message" text,
	"quarantine_key" text NOT NULL,
	"clean_key" text,
	"scanner" text,
	"scanned_at" timestamp with time zone,
	"job_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uploads_id_ck" CHECK ("core"."uploads"."id" ~ '^upl_[0-9a-hjkmnp-tv-z]{26}$'),
	CONSTRAINT "uploads_status_ck" CHECK ("core"."uploads"."status" in ('quarantined', 'clean', 'rejected', 'scan_unavailable')),
	CONSTRAINT "uploads_error_code_ck" CHECK ("core"."uploads"."error_code" is null or "core"."uploads"."error_code" in ('too_large', 'empty', 'type_not_accepted', 'type_mismatch', 'malware_detected', 'scanner_unavailable', 'storage_unavailable', 'invalid_filename')),
	CONSTRAINT "uploads_size_ck" CHECK ("core"."uploads"."byte_size" > 0),
	CONSTRAINT "uploads_sha256_ck" CHECK ("core"."uploads"."sha256" is null or "core"."uploads"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "uploads_clean_ck" CHECK (("core"."uploads"."status" = 'clean') = ("core"."uploads"."clean_key" is not null) and ("core"."uploads"."status" <> 'clean' or "core"."uploads"."sha256" is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."job_steps" ADD CONSTRAINT "job_steps_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "core"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."jobs" ADD CONSTRAINT "jobs_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "core"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."jobs" ADD CONSTRAINT "jobs_cancel_requested_by_users_id_fk" FOREIGN KEY ("cancel_requested_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."jobs" ADD CONSTRAINT "jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."uploads" ADD CONSTRAINT "uploads_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "core"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."uploads" ADD CONSTRAINT "uploads_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_idempotency_uq" ON "core"."jobs" USING btree ("tenant_id","type","idempotency_key");--> statement-breakpoint
CREATE INDEX "jobs_ready_idx" ON "core"."jobs" USING btree ("available_at") WHERE "core"."jobs"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "jobs_tenant_created_idx" ON "core"."jobs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uploads_quarantine_key_uq" ON "core"."uploads" USING btree ("quarantine_key");--> statement-breakpoint
CREATE INDEX "uploads_tenant_created_idx" ON "core"."uploads" USING btree ("tenant_id","created_at");