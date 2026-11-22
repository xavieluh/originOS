-- Reverses 0006: drops the ingestion and job tables and their data.
DROP TABLE IF EXISTS core.job_steps;
--> statement-breakpoint
DROP TABLE IF EXISTS core.jobs;
--> statement-breakpoint
DROP TABLE IF EXISTS core.uploads;
