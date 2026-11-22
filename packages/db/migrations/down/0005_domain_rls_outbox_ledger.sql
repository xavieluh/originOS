-- Reverses 0005. The originos_worker role is cluster-wide and may be used by
-- other databases on the same server, so it is kept (only its grants go).
DROP TRIGGER IF EXISTS chain_audit_event ON core.audit_events;
--> statement-breakpoint
DROP FUNCTION IF EXISTS core.verify_audit_chain(uuid);
--> statement-breakpoint
DROP FUNCTION IF EXISTS core.chain_audit_event();
--> statement-breakpoint
DROP FUNCTION IF EXISTS core.audit_event_hash(text, core.audit_events);
--> statement-breakpoint
DROP FUNCTION IF EXISTS core.actor_digest(uuid);
--> statement-breakpoint
ALTER TABLE core.audit_events DROP COLUMN IF EXISTS actor_digest;
--> statement-breakpoint
UPDATE core.audit_events SET seq = NULL, prev_hash = NULL, hash = NULL;
--> statement-breakpoint
DROP POLICY IF EXISTS outbox_receipts_worker ON core.outbox_receipts;
--> statement-breakpoint
ALTER TABLE core.outbox_receipts NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS outbox_events_worker ON core.outbox_events;
--> statement-breakpoint
DROP POLICY IF EXISTS outbox_events_insert ON core.outbox_events;
--> statement-breakpoint
ALTER TABLE core.outbox_events NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS subjects_insert ON trust.subjects;
--> statement-breakpoint
DO $$
DECLARE
  tbl text;
  name text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'trust.subjects', 'trust.identity_claims', 'trust.provenance_assertions', 'content.works',
    'content.work_versions', 'content.artifacts', 'evidence.sources', 'evidence.claims',
    'agents.agent_runs', 'agents.tool_actions', 'agents.approvals', 'core.relations'
  ] LOOP
    name := split_part(tbl, '.', 2);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', name || '_select', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', name || '_insert', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', name || '_update', tbl);
    EXECUTE format('ALTER TABLE %s NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP TRIGGER IF EXISTS register_object ON %s', tbl);
    EXECUTE format('DROP TRIGGER IF EXISTS unregister_object ON %s', tbl);
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', tbl, name || '_object_fk');
    EXECUTE format('REVOKE ALL ON %s FROM originos_app', tbl);
  END LOOP;
END
$$;
--> statement-breakpoint
DROP POLICY IF EXISTS objects_select ON core.objects;
--> statement-breakpoint
ALTER TABLE core.objects DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON core.objects, core.relation_rules, core.outbox_events FROM originos_app;
--> statement-breakpoint
REVOKE ALL ON core.outbox_events, core.outbox_receipts FROM originos_worker;
--> statement-breakpoint
DROP FUNCTION IF EXISTS core.can_act_as(text);
--> statement-breakpoint
DROP FUNCTION IF EXISTS core.register_object();
--> statement-breakpoint
DELETE FROM core.relation_rules;
--> statement-breakpoint
REVOKE USAGE ON SCHEMA trust, content, evidence, agents FROM originos_app;
--> statement-breakpoint
REVOKE USAGE ON SCHEMA core FROM originos_worker;
