-- Reverses 0004: drops the domain schemas and tables and the audit chain columns.
-- Destroys their data; only ever run in development and test (see packages/db/migrations/README.md).
DROP SCHEMA IF EXISTS agents CASCADE;
--> statement-breakpoint
DROP SCHEMA IF EXISTS content CASCADE;
--> statement-breakpoint
DROP SCHEMA IF EXISTS evidence CASCADE;
--> statement-breakpoint
DROP SCHEMA IF EXISTS trust CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS core.relations, core.outbox_receipts, core.outbox_events, core.relation_rules, core.objects CASCADE;
--> statement-breakpoint
DROP INDEX IF EXISTS core.audit_events_tenant_seq_uq;
--> statement-breakpoint
ALTER TABLE core.audit_events DROP COLUMN IF EXISTS seq, DROP COLUMN IF EXISTS prev_hash, DROP COLUMN IF EXISTS hash;
