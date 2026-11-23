-- Reverses 0012_audit_guards: drops the guards and restores the three functions
-- exactly as 0003, 0009 and 0011 created them.
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
CREATE OR REPLACE FUNCTION trust.public_profile_proofs(p_profile_id text)
RETURNS TABLE (id text, kind text, method text, label text, provider text, status text, first_verified_at timestamptz,
               last_verified_at timestamptz, expires_at timestamptz, stale_reason text, revoked_at timestamptz,
               revoked_reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, trust AS
$$ SELECT x.id, x.kind, x.method, x.label, x.provider, x.status, x.first_verified_at, x.last_verified_at,
          x.expires_at, x.stale_reason, x.revoked_at, x.revoked_reason
     FROM trust.identity_proofs x
     JOIN trust.profiles p ON p.tenant_id = x.tenant_id AND p.id = x.profile_id
    WHERE x.profile_id = p_profile_id AND x.visibility = 'public' AND x.status <> 'pending'
      AND x.last_verified_at IS NOT NULL
      AND p.visibility = 'public' AND p.moderation_state = 'active' $$;
DROP TRIGGER IF EXISTS guard_proof_owner ON trust.identity_proofs;
DROP FUNCTION IF EXISTS trust.guard_proof_owner();
DROP TRIGGER IF EXISTS guard_profile_content ON trust.profiles;
DROP FUNCTION IF EXISTS trust.guard_profile_content();
DROP TRIGGER IF EXISTS guard_identity_claim_update ON trust.identity_claims;
DROP FUNCTION IF EXISTS trust.guard_identity_claim_update();
DROP TRIGGER IF EXISTS guard_tool_action_update ON agents.tool_actions;
DROP FUNCTION IF EXISTS agents.guard_tool_action_update();
DROP TRIGGER IF EXISTS guard_approval ON agents.approvals;
DROP FUNCTION IF EXISTS agents.guard_approval();
CREATE OR REPLACE FUNCTION core.owns_agent(agent_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, core AS
$$ SELECT EXISTS (SELECT 1 FROM core.agents a WHERE a.id = agent_id AND a.owner_user_id = core.current_user_id()) $$;
