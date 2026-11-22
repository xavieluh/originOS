-- Phase 07 (ADR-026): privileges and row-level security for uploads and jobs.
-- Reverse: down/0007_ingest_jobs_rls.sql.
--
-- The application role records uploads and enqueues jobs for its own tenant;
-- owners and admins manage jobs (retry, cancel, resume) through column-limited
-- updates. The worker role processes every tenant's uploads and jobs but sees
-- no other tenant data, and may append outbox events for what it publishes.

GRANT SELECT, INSERT ON core.uploads, core.jobs TO originos_app;
--> statement-breakpoint
GRANT UPDATE (status, attempts, max_attempts, available_at, wait_reason, resume_input,
  cancel_requested_at, cancel_requested_by, last_error, finished_at, updated_at) ON core.jobs TO originos_app;
--> statement-breakpoint
GRANT SELECT ON core.job_steps TO originos_app;
--> statement-breakpoint
GRANT SELECT, UPDATE (status, error_code, error_message, detected_type, sha256, clean_key, scanner,
  scanned_at, updated_at) ON core.uploads TO originos_worker;
--> statement-breakpoint
GRANT SELECT, UPDATE (status, attempts, available_at, locked_by, locked_until, progress, progress_message,
  last_error, wait_reason, result, finished_at, updated_at) ON core.jobs TO originos_worker;
--> statement-breakpoint
GRANT SELECT, INSERT ON core.job_steps TO originos_worker;
--> statement-breakpoint
GRANT INSERT ON core.outbox_events TO originos_worker;
--> statement-breakpoint

ALTER TABLE core.uploads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.uploads FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY uploads_select ON core.uploads FOR SELECT TO originos_app
  USING (tenant_id = core.current_tenant_id() AND core.member_role(tenant_id) IS NOT NULL);
--> statement-breakpoint
-- New uploads start in quarantine, attributed to the person uploading.
CREATE POLICY uploads_insert ON core.uploads FOR INSERT TO originos_app
  WITH CHECK (
    tenant_id = core.current_tenant_id()
    AND core.member_role(tenant_id) IS NOT NULL
    AND uploaded_by_user_id = core.current_user_id()
    AND status = 'quarantined' AND clean_key IS NULL AND scanned_at IS NULL
  );
--> statement-breakpoint
CREATE POLICY uploads_worker ON core.uploads FOR ALL TO originos_worker USING (true) WITH CHECK (true);
--> statement-breakpoint

ALTER TABLE core.jobs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.jobs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Owners and admins see the organization's jobs; anyone sees the jobs they started.
CREATE POLICY jobs_select ON core.jobs FOR SELECT TO originos_app
  USING (
    tenant_id = core.current_tenant_id()
    AND (core.member_role(tenant_id) IN ('owner', 'admin')
         OR (core.member_role(tenant_id) IS NOT NULL AND created_by_user_id = core.current_user_id()))
  );
--> statement-breakpoint
CREATE POLICY jobs_insert ON core.jobs FOR INSERT TO originos_app
  WITH CHECK (
    tenant_id = core.current_tenant_id()
    AND core.member_role(tenant_id) IS NOT NULL
    AND created_by_user_id = core.current_user_id()
    AND status = 'pending' AND attempts = 0 AND locked_by IS NULL
  );
--> statement-breakpoint
CREATE POLICY jobs_update ON core.jobs FOR UPDATE TO originos_app
  USING (tenant_id = core.current_tenant_id() AND core.member_role(tenant_id) IN ('owner', 'admin'))
  WITH CHECK (tenant_id = core.current_tenant_id() AND status IN ('pending', 'cancelled', 'running', 'waiting', 'dead'));
--> statement-breakpoint
CREATE POLICY jobs_worker ON core.jobs FOR ALL TO originos_worker USING (true) WITH CHECK (true);
--> statement-breakpoint

ALTER TABLE core.job_steps ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.job_steps FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY job_steps_select ON core.job_steps FOR SELECT TO originos_app
  USING (EXISTS (SELECT 1 FROM core.jobs j WHERE j.id = job_id));
--> statement-breakpoint
CREATE POLICY job_steps_worker ON core.job_steps FOR ALL TO originos_worker USING (true) WITH CHECK (true);
