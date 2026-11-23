-- Audit of Phases 00–09 (2026-11-23): database rules the API already follows,
-- now enforced in PostgreSQL too, so they hold whatever the application role
-- does (CLAUDE.md rule 5). Additive: new guard triggers, and three functions
-- replaced with stricter versions (core.owns_agent, core.accept_webhook,
-- trust.public_profile_proofs). The schema owner and the worker's definer
-- functions are not affected by the guards.

-- 1. An agent is "owned" only inside the organization it belongs to, so an agent
--    subject cannot be created in another organization of the same person.
CREATE OR REPLACE FUNCTION core.owns_agent(agent_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, core AS
$$ SELECT EXISTS (SELECT 1 FROM core.agents a WHERE a.id = agent_id AND a.owner_user_id = core.current_user_id()
                  AND a.tenant_id = core.current_tenant_id()) $$;
--> statement-breakpoint

-- 2. Human approvals: created pending, decided once, by a person acting as
--    themselves (never an agent), who is not the subject that asked.
CREATE FUNCTION agents.guard_approval() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, core, trust, agents AS
$$
DECLARE
  requester text;
BEGIN
  IF current_user <> 'originos_app' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.decision <> 'pending' THEN
      RAISE EXCEPTION 'an approval starts pending and is decided by a person' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.decision IS NOT DISTINCT FROM OLD.decision
     AND (NEW.decided_by_subject_id, NEW.decided_at) IS NOT DISTINCT FROM (OLD.decided_by_subject_id, OLD.decided_at) THEN
    RETURN NEW;
  END IF;
  IF OLD.decision <> 'pending' THEN
    RAISE EXCEPTION 'an approval is decided once' USING ERRCODE = '42501';
  END IF;
  IF NEW.decision IN ('approved', 'rejected') THEN
    SELECT a.created_by_subject_id INTO requester FROM agents.tool_actions a
     WHERE a.tenant_id = OLD.tenant_id AND a.id = OLD.action_id;
    IF NEW.decided_at IS DISTINCT FROM now()
       OR NOT EXISTS (SELECT 1 FROM trust.subjects s
                       WHERE s.tenant_id = OLD.tenant_id AND s.id = NEW.decided_by_subject_id
                         AND s.kind = 'human' AND s.user_id = core.current_user_id())
       OR NEW.decided_by_subject_id IS NOT DISTINCT FROM requester
       OR NEW.decided_by_subject_id IS NOT DISTINCT FROM OLD.created_by_subject_id THEN
      RAISE EXCEPTION 'approvals are decided by a person, as themselves, who did not ask' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER guard_approval BEFORE INSERT OR UPDATE ON agents.approvals
  FOR EACH ROW EXECUTE FUNCTION agents.guard_approval();
--> statement-breakpoint

-- 3. A tool action is approved only with an approved approval, and finished
--    actions (rejected, executed, failed) stay as they ended.
CREATE FUNCTION agents.guard_tool_action_update() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, core, agents AS
$$
BEGIN
  IF current_user <> 'originos_app' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('rejected', 'executed', 'failed') THEN
    RAISE EXCEPTION 'a finished tool action keeps its outcome' USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'approved' AND NOT EXISTS (
       SELECT 1 FROM agents.approvals ap
        WHERE ap.tenant_id = OLD.tenant_id AND ap.action_id = OLD.id AND ap.decision = 'approved') THEN
    RAISE EXCEPTION 'a tool action is approved only by an approved approval' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER guard_tool_action_update BEFORE UPDATE ON agents.tool_actions
  FOR EACH ROW EXECUTE FUNCTION agents.guard_tool_action_update();
--> statement-breakpoint

-- 4. Identity claims: revocation and supersession are one-way, and only an owner
--    or admin or someone who acts as the claim's subject makes them.
CREATE FUNCTION trust.guard_identity_claim_update() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, core, trust AS
$$
BEGIN
  IF current_user <> 'originos_app' THEN
    RETURN NEW;
  END IF;
  IF (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
     OR (OLD.superseded_by_id IS NOT NULL AND NEW.superseded_by_id IS DISTINCT FROM OLD.superseded_by_id) THEN
    RAISE EXCEPTION 'a revoked or superseded claim stays that way' USING ERRCODE = '42501';
  END IF;
  IF (NEW.revoked_at, NEW.superseded_by_id) IS DISTINCT FROM (OLD.revoked_at, OLD.superseded_by_id)
     AND core.member_role(OLD.tenant_id) NOT IN ('owner', 'admin')
     AND NOT core.can_act_as(OLD.subject_id) THEN
    RAISE EXCEPTION 'only an owner or admin or the claim''s subject ends a claim' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER guard_identity_claim_update BEFORE UPDATE ON trust.identity_claims
  FOR EACH ROW EXECUTE FUNCTION trust.guard_identity_claim_update();
--> statement-breakpoint

-- 5. A profile's content (handle, name, bio, visibility, indexing) is changed only
--    by whoever manages it: the creator, or owners and admins for the
--    organization profile. Owners and admins moderate creator profiles; they do
--    not edit them.
CREATE FUNCTION trust.guard_profile_content() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, core, trust AS
$$
BEGIN
  IF current_user <> 'originos_app' THEN
    RETURN NEW;
  END IF;
  IF (NEW.handle, NEW.display_name, NEW.bio, NEW.visibility, NEW.pseudonymous, NEW.discoverable)
     IS DISTINCT FROM (OLD.handle, OLD.display_name, OLD.bio, OLD.visibility, OLD.pseudonymous, OLD.discoverable)
     AND NOT trust.can_manage_profile(OLD.id) THEN
    RAISE EXCEPTION 'only the profile''s owner changes its content' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER guard_profile_content BEFORE UPDATE ON trust.profiles
  FOR EACH ROW EXECUTE FUNCTION trust.guard_profile_content();
--> statement-breakpoint

-- 6. Proofs: only the profile's manager changes what is shown publicly, and an
--    account proof is recorded as verified only right after the same person
--    finished an identity-proof sign-in for that profile (a consumed attempt,
--    within its 10-minute lifetime).
CREATE FUNCTION trust.guard_proof_owner() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, core, trust AS
$$
BEGIN
  IF current_user <> 'originos_app' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.visibility IS DISTINCT FROM OLD.visibility
     AND NOT trust.can_manage_profile(OLD.profile_id) THEN
    RAISE EXCEPTION 'only the profile''s owner changes what its proofs show' USING ERRCODE = '42501';
  END IF;
  IF NEW.kind = 'account' AND NEW.status = 'verified'
     AND (TG_OP = 'INSERT'
          OR (OLD.status, OLD.label, OLD.last_verified_at, OLD.expires_at, OLD.claim_id)
             IS DISTINCT FROM (NEW.status, NEW.label, NEW.last_verified_at, NEW.expires_at, NEW.claim_id))
     AND NOT EXISTS (
       SELECT 1 FROM core.oauth_states o
        WHERE o.tenant_id = NEW.tenant_id AND o.user_id = core.current_user_id()
          AND o.purpose = 'identity_proof' AND o.profile_id = NEW.profile_id AND o.provider = NEW.provider
          AND o.consumed_at IS NOT NULL AND o.consumed_at > now() - interval '10 minutes') THEN
    RAISE EXCEPTION 'an account proof is recorded only after signing in to that account' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER guard_proof_owner BEFORE INSERT OR UPDATE ON trust.identity_proofs
  FOR EACH ROW EXECUTE FUNCTION trust.guard_proof_owner();
--> statement-breakpoint

-- 7. Public pages show a failed re-check as a fixed sentence with its date; the
--    lookup detail (which can describe the owner's network) stays inside the
--    organization.
CREATE OR REPLACE FUNCTION trust.public_profile_proofs(p_profile_id text)
RETURNS TABLE (id text, kind text, method text, label text, provider text, status text, first_verified_at timestamptz,
               last_verified_at timestamptz, expires_at timestamptz, stale_reason text, revoked_at timestamptz,
               revoked_reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, trust AS
$$ SELECT x.id, x.kind, x.method, x.label, x.provider, x.status, x.first_verified_at, x.last_verified_at,
          x.expires_at,
          regexp_replace(x.stale_reason, '^(The re-check on [0-9]{4}-[0-9]{2}-[0-9]{2} failed):.*$', '\1.', 's'),
          x.revoked_at, x.revoked_reason
     FROM trust.identity_proofs x
     JOIN trust.profiles p ON p.tenant_id = x.tenant_id AND p.id = x.profile_id
    WHERE x.profile_id = p_profile_id AND x.visibility = 'public' AND x.status <> 'pending'
      AND x.last_verified_at IS NOT NULL
      AND p.visibility = 'public' AND p.moderation_state = 'active' $$;
--> statement-breakpoint

-- 8. Webhooks: a body already recorded for the connection is a duplicate even
--    under a new delivery id (GitHub signs the body, not the delivery header).
-- The supporting index is in 0013 (generated from the Drizzle schema).
CREATE OR REPLACE FUNCTION core.accept_webhook(
  p_connection_id text, p_provider text, p_delivery_id text, p_event text, p_payload jsonb,
  p_payload_sha256 text, p_byte_size integer, p_record_id text, p_event_id text, p_correlation_id text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, core AS
$$
DECLARE
  c_tenant uuid;
  c_status text;
  inserted text;
BEGIN
  SELECT tenant_id, status INTO c_tenant, c_status FROM core.integration_connections
   WHERE id = p_connection_id AND provider = p_provider;
  IF NOT FOUND THEN
    RETURN 'unknown_connection';
  END IF;
  IF c_status = 'revoked' THEN
    RETURN 'revoked';
  END IF;
  -- One writer per connection and body at a time, so two copies racing both see each other.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_connection_id || ':' || p_payload_sha256, 0));
  IF EXISTS (SELECT 1 FROM core.webhook_deliveries d
              WHERE d.connection_id = p_connection_id AND d.payload_sha256 = p_payload_sha256) THEN
    RETURN 'duplicate';
  END IF;
  INSERT INTO core.webhook_deliveries (id, tenant_id, connection_id, provider, delivery_id, event, payload,
      payload_sha256, byte_size, correlation_id)
  VALUES (p_record_id, c_tenant, p_connection_id, p_provider, p_delivery_id, p_event, p_payload,
      p_payload_sha256, p_byte_size, p_correlation_id)
  ON CONFLICT (provider, delivery_id) DO NOTHING
  RETURNING id INTO inserted;
  IF inserted IS NULL THEN
    RETURN 'duplicate';
  END IF;
  INSERT INTO core.outbox_events (id, tenant_id, type, subject_ref, payload, correlation_id)
  VALUES (p_event_id, c_tenant, 'integration.webhook_received', p_record_id,
    jsonb_build_object('deliveryId', p_record_id, 'connectionId', p_connection_id,
                       'provider', p_provider, 'event', p_event),
    p_correlation_id);
  RETURN 'accepted';
END
$$;
