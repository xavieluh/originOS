-- Reverses 0007.
DROP POLICY IF EXISTS job_steps_worker ON core.job_steps;
--> statement-breakpoint
DROP POLICY IF EXISTS job_steps_select ON core.job_steps;
--> statement-breakpoint
DROP POLICY IF EXISTS jobs_worker ON core.jobs;
--> statement-breakpoint
DROP POLICY IF EXISTS jobs_update ON core.jobs;
--> statement-breakpoint
DROP POLICY IF EXISTS jobs_insert ON core.jobs;
--> statement-breakpoint
DROP POLICY IF EXISTS jobs_select ON core.jobs;
--> statement-breakpoint
DROP POLICY IF EXISTS uploads_worker ON core.uploads;
--> statement-breakpoint
DROP POLICY IF EXISTS uploads_insert ON core.uploads;
--> statement-breakpoint
DROP POLICY IF EXISTS uploads_select ON core.uploads;
--> statement-breakpoint
ALTER TABLE core.job_steps DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.jobs DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.uploads DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE INSERT ON core.outbox_events FROM originos_worker;
--> statement-breakpoint
REVOKE ALL ON core.uploads, core.jobs, core.job_steps FROM originos_app, originos_worker;
