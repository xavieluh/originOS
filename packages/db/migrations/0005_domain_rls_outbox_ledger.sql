-- Phase 06: object registry triggers, relation rules, row-level security for the
-- domain tables, the outbox worker role, and a tamper-evident audit chain
-- (ADR-002, ADR-003, ADR-025). Reverse: down/0005_domain_rls_outbox_ledger.sql.
--
-- Domain rows are visible to members of their tenant (private rows only to the
-- person who created them). The application role can insert and change only
-- the columns that represent a state change (status, revocation, supersession);
-- facts themselves are immutable, and nothing can be deleted by the application.

-- 1. Roles ------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'originos_worker') THEN
    CREATE ROLE originos_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
GRANT originos_worker TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA trust, content, evidence, agents TO originos_app;
--> statement-breakpoint
GRANT USAGE ON SCHEMA core TO originos_worker;
--> statement-breakpoint

-- 2. Object registry --------------------------------------------------------
-- Every domain row is registered in core.objects on insert and removed on
-- delete, so relations and assertions can reference any object with real
-- foreign keys (no orphaned edges). Runs as the owner: the application role
-- cannot write core.objects directly.
CREATE FUNCTION core.register_object() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core AS
$$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO core.objects (id, tenant_id, kind) VALUES (NEW.id, NEW.tenant_id, TG_ARGV[0]);
    RETURN NEW;
  END IF;
  DELETE FROM core.objects WHERE id = OLD.id;
  RETURN OLD;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.register_object() FROM PUBLIC;
--> statement-breakpoint
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('trust.subjects', 'subject'), ('trust.identity_claims', 'identity_claim'),
    ('trust.provenance_assertions', 'provenance_assertion'), ('content.works', 'work'),
    ('content.work_versions', 'work_version'), ('content.artifacts', 'artifact'),
    ('evidence.sources', 'source'), ('evidence.claims', 'claim'),
    ('agents.agent_runs', 'agent_run'), ('agents.tool_actions', 'tool_action'),
    ('agents.approvals', 'approval'), ('core.relations', 'relation')
  ) AS t(tbl, kind) LOOP
    EXECUTE format('CREATE TRIGGER register_object BEFORE INSERT ON %s FOR EACH ROW EXECUTE FUNCTION core.register_object(%L)', r.tbl, r.kind);
    EXECUTE format('CREATE TRIGGER unregister_object AFTER DELETE ON %s FOR EACH ROW EXECUTE FUNCTION core.register_object(%L)', r.tbl, r.kind);
    -- Every domain row is also an object; its id can never point at a different registry row.
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (tenant_id, id) REFERENCES core.objects (tenant_id, id) DEFERRABLE INITIALLY DEFERRED', r.tbl, split_part(r.tbl, '.', 2) || '_object_fk');
  END LOOP;
END
$$;
--> statement-breakpoint

-- 3. Relation rules (mirror of RELATION_RULES in @originos/contracts; a test checks they match)
INSERT INTO core.relation_rules (type, from_kind, to_kind) VALUES
  ('DERIVED_FROM', 'work_version', 'work_version'),
  ('DERIVED_FROM', 'artifact', 'artifact'),
  ('CITES', 'work_version', 'source'),
  ('SUPPORTS', 'source', 'claim'),
  ('CONTRADICTS', 'source', 'claim'),
  ('CREATED', 'subject', 'work'),
  ('CONTRIBUTED_TO', 'subject', 'work_version'),
  ('ATTESTS', 'provenance_assertion', 'work_version'),
  ('ATTESTS', 'provenance_assertion', 'artifact'),
  ('PRODUCED', 'agent_run', 'artifact'),
  ('PRODUCED', 'agent_run', 'work_version'),
  ('USED', 'agent_run', 'source'),
  ('ACTS_FOR', 'subject', 'subject'),
  ('MEMBER_OF', 'subject', 'subject');
--> statement-breakpoint

-- 4. Helpers ----------------------------------------------------------------
-- Whether the current user may act as this subject: it is them, or an active agent they own.
CREATE FUNCTION core.can_act_as(subject_id text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core, trust AS
$$ SELECT EXISTS (
     SELECT 1 FROM trust.subjects s
     LEFT JOIN core.agents a ON a.id = s.agent_id
     WHERE s.id = subject_id
       AND s.tenant_id = core.current_tenant_id()
       AND (s.user_id = core.current_user_id()
            OR (a.owner_user_id = core.current_user_id() AND a.status = 'active'))) $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.can_act_as(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.can_act_as(text) TO originos_app;
--> statement-breakpoint

-- 5. Grants: read and insert; update only state-change columns; never delete.
GRANT SELECT ON core.objects, core.relation_rules TO originos_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON trust.subjects, trust.identity_claims, trust.provenance_assertions,
  content.works, content.work_versions, content.artifacts, evidence.sources, evidence.claims,
  agents.agent_runs, agents.tool_actions, agents.approvals, core.relations TO originos_app;
--> statement-breakpoint
GRANT UPDATE (display_name, updated_at) ON trust.subjects TO originos_app;
--> statement-breakpoint
GRANT UPDATE (revoked_at, superseded_by_id, updated_at) ON trust.identity_claims, evidence.claims, core.relations TO originos_app;
--> statement-breakpoint
GRANT UPDATE (status, updated_at) ON evidence.claims TO originos_app;
--> statement-breakpoint
GRANT UPDATE (review_state) ON core.relations TO originos_app;
--> statement-breakpoint
GRANT UPDATE (revoked_at, updated_at) ON trust.provenance_assertions, content.work_versions, content.artifacts, evidence.sources TO originos_app;
--> statement-breakpoint
GRANT UPDATE (title, status, updated_at) ON content.works TO originos_app;
--> statement-breakpoint
GRANT UPDATE (status, ended_at, updated_at) ON agents.agent_runs TO originos_app;
--> statement-breakpoint
GRANT UPDATE (status, outcome_confirmed_at, updated_at) ON agents.tool_actions TO originos_app;
--> statement-breakpoint
GRANT UPDATE (decision, decided_by_subject_id, decided_at, reason, updated_at) ON agents.approvals TO originos_app;
--> statement-breakpoint
GRANT INSERT ON core.outbox_events TO originos_app;
--> statement-breakpoint
GRANT SELECT, UPDATE (status, attempts, available_at, locked_by, locked_until, last_error, delivered_at) ON core.outbox_events TO originos_worker;
--> statement-breakpoint
GRANT SELECT, INSERT ON core.outbox_receipts TO originos_worker;
--> statement-breakpoint

-- 6. Row-level security -----------------------------------------------------
-- core.objects is written only by the SECURITY DEFINER trigger (table owner),
-- so RLS is enabled but not forced.
ALTER TABLE core.objects ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY objects_select ON core.objects FOR SELECT TO originos_app
  USING (tenant_id = core.current_tenant_id() AND core.member_role(tenant_id) IS NOT NULL);
--> statement-breakpoint
DO $$
DECLARE
  tbl text;
  has_visibility boolean;
  name text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'trust.subjects', 'trust.identity_claims', 'trust.provenance_assertions', 'content.works',
    'content.work_versions', 'content.artifacts', 'evidence.sources', 'evidence.claims',
    'agents.agent_runs', 'agents.tool_actions', 'agents.approvals', 'core.relations'
  ] LOOP
    name := split_part(tbl, '.', 2);
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = split_part(tbl, '.', 1) AND table_name = name AND column_name = 'visibility'
    ) INTO has_visibility;
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
    -- Members see their tenant's rows; "private" rows only their creator sees.
    EXECUTE format(
      'CREATE POLICY %I ON %s FOR SELECT TO originos_app USING (tenant_id = core.current_tenant_id() AND core.member_role(tenant_id) IS NOT NULL%s)',
      name || '_select', tbl,
      CASE WHEN has_visibility THEN ' AND (visibility <> ''private'' OR core.can_act_as(created_by_subject_id))' ELSE '' END);
    -- Members write in their own tenant, attributing the row only to themselves or an agent they own.
    IF tbl <> 'trust.subjects' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %s FOR INSERT TO originos_app WITH CHECK (tenant_id = core.current_tenant_id() AND core.member_role(tenant_id) IS NOT NULL AND created_by_subject_id IS NOT NULL AND core.can_act_as(created_by_subject_id))',
        name || '_insert', tbl);
    END IF;
    EXECUTE format(
      'CREATE POLICY %I ON %s FOR UPDATE TO originos_app USING (tenant_id = core.current_tenant_id() AND core.member_role(tenant_id) IS NOT NULL) WITH CHECK (tenant_id = core.current_tenant_id())',
      name || '_update', tbl);
  END LOOP;
END
$$;
--> statement-breakpoint
-- Subjects: you can register yourself, an agent you own, and (owners and admins)
-- organizations and services. Nobody registers another person.
CREATE POLICY subjects_insert ON trust.subjects FOR INSERT TO originos_app
  WITH CHECK (
    tenant_id = core.current_tenant_id()
    AND core.member_role(tenant_id) IS NOT NULL
    AND CASE kind
      WHEN 'human' THEN user_id = core.current_user_id()
      WHEN 'agent' THEN core.owns_agent(agent_id)
      ELSE core.member_role(tenant_id) IN ('owner', 'admin')
    END
  );
--> statement-breakpoint
-- Outbox: the application only appends events for its own tenant; the worker reads and updates them.
ALTER TABLE core.outbox_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.outbox_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY outbox_events_insert ON core.outbox_events FOR INSERT TO originos_app
  WITH CHECK (
    tenant_id = core.current_tenant_id()
    AND core.member_role(tenant_id) IS NOT NULL
    AND status = 'pending' AND attempts = 0
  );
--> statement-breakpoint
CREATE POLICY outbox_events_worker ON core.outbox_events FOR ALL TO originos_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE core.outbox_receipts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.outbox_receipts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY outbox_receipts_worker ON core.outbox_receipts FOR ALL TO originos_worker USING (true) WITH CHECK (true);
--> statement-breakpoint

-- 7. Tamper-evident audit chain --------------------------------------------
-- Each tenant's audit events form a hash chain: seq increments by one and hash
-- = SHA-256(previous hash, this event). Editing or deleting a past event (only
-- possible for the schema owner) breaks verification from that point on.
-- The actor enters the hash as a digest, so erasing a person keeps the chain valid.
ALTER TABLE core.audit_events ADD COLUMN actor_digest text;
--> statement-breakpoint
CREATE FUNCTION core.actor_digest(actor uuid) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS
$$ SELECT CASE WHEN actor IS NULL THEN NULL
               ELSE encode(sha256(convert_to('originos-audit-actor:' || actor::text, 'UTF8')), 'hex') END $$;
--> statement-breakpoint
CREATE FUNCTION core.audit_event_hash(prev text, e core.audit_events) RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog, core AS
$$ SELECT encode(sha256(convert_to(concat_ws(chr(31),
     coalesce(prev, ''), e.tenant_id::text, e.seq::text, e.id::text,
     coalesce(e.actor_digest, ''), e.action, e.target_type, e.target_id,
     e.metadata::text, coalesce(e.correlation_id, ''),
     to_char(e.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')), 'UTF8')), 'hex') $$;
--> statement-breakpoint
CREATE FUNCTION core.chain_audit_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core AS
$$
DECLARE
  last_seq bigint;
  last_hash text;
BEGIN
  -- Serialize appends per tenant so sequence numbers have no gaps or forks.
  PERFORM pg_advisory_xact_lock(hashtextextended('audit:' || NEW.tenant_id::text, 0));
  SELECT seq, hash INTO last_seq, last_hash FROM core.audit_events
    WHERE tenant_id = NEW.tenant_id ORDER BY seq DESC LIMIT 1;
  NEW.seq := coalesce(last_seq, 0) + 1;
  NEW.prev_hash := last_hash;
  NEW.actor_digest := core.actor_digest(NEW.actor_user_id);
  NEW.hash := core.audit_event_hash(last_hash, NEW);
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.chain_audit_event() FROM PUBLIC;
--> statement-breakpoint
-- Backfill existing events, oldest first. The columns stay nullable in the
-- schema (the trigger always fills them); verification treats a gap as a break.
DO $$
DECLARE
  e core.audit_events;
  prev text;
  n bigint;
  current_tenant uuid;
BEGIN
  FOR e IN SELECT * FROM core.audit_events ORDER BY tenant_id, occurred_at, id LOOP
    IF current_tenant IS DISTINCT FROM e.tenant_id THEN
      current_tenant := e.tenant_id; prev := NULL; n := 0;
    END IF;
    n := n + 1;
    e.seq := n;
    e.prev_hash := prev;
    e.actor_digest := core.actor_digest(e.actor_user_id);
    e.hash := core.audit_event_hash(prev, e);
    UPDATE core.audit_events SET seq = e.seq, prev_hash = e.prev_hash, actor_digest = e.actor_digest, hash = e.hash
     WHERE id = e.id;
    prev := e.hash;
  END LOOP;
END
$$;
--> statement-breakpoint
CREATE TRIGGER chain_audit_event BEFORE INSERT ON core.audit_events
  FOR EACH ROW EXECUTE FUNCTION core.chain_audit_event();
--> statement-breakpoint
-- The first event (by seq) whose link or hash does not verify, or null if the chain is intact.
-- A present actor must match its digest; an erased actor (null) is allowed.
CREATE FUNCTION core.verify_audit_chain(t uuid) RETURNS bigint LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, core AS
$$
DECLARE
  e core.audit_events;
  prev text;
  expected bigint := 1;
BEGIN
  FOR e IN SELECT * FROM core.audit_events WHERE tenant_id = t ORDER BY seq NULLS FIRST, occurred_at LOOP
    IF e.seq IS DISTINCT FROM expected OR e.prev_hash IS DISTINCT FROM prev
       OR e.hash IS DISTINCT FROM core.audit_event_hash(prev, e)
       OR (e.actor_user_id IS NOT NULL AND e.actor_digest IS DISTINCT FROM core.actor_digest(e.actor_user_id)) THEN
      RETURN expected;
    END IF;
    prev := e.hash;
    expected := expected + 1;
  END LOOP;
  RETURN NULL;
END
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.verify_audit_chain(uuid) TO originos_app;
