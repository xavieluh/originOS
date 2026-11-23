-- Phase 08 (ADR-027): privileges and row-level security for Origin Connect.
-- Reverse: down/0009_connect_rls.sql.
--
-- The application role records connections and OAuth attempts for its own
-- tenant, but cannot read sealed tokens: its SELECT grant leaves those columns
-- out. Only the worker, which makes provider calls, reads them. Inbound
-- webhooks arrive without a session, so they are recorded only through
-- core.accept_webhook(), which finds the connection's tenant itself.

GRANT SELECT (id, tenant_id, provider, status, account_id, account_label, granted_scopes, token_key_id,
  token_expires_at, connected_by_user_id, last_checked_at, last_error, revoked_at, revoked_by_user_id,
  created_at, updated_at) ON core.integration_connections TO originos_app;
--> statement-breakpoint
GRANT INSERT ON core.integration_connections TO originos_app;
--> statement-breakpoint
GRANT UPDATE (status, account_label, granted_scopes, access_token_sealed, refresh_token_sealed, token_key_id,
  token_expires_at, connected_by_user_id, last_error, revoked_at, revoked_by_user_id, updated_at)
  ON core.integration_connections TO originos_app;
--> statement-breakpoint
GRANT SELECT, UPDATE (status, granted_scopes, access_token_sealed, refresh_token_sealed, token_key_id,
  token_expires_at, last_checked_at, last_error, updated_at) ON core.integration_connections TO originos_worker;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE, UPDATE (consumed_at) ON core.oauth_states TO originos_app;
--> statement-breakpoint
GRANT SELECT ON core.webhook_deliveries TO originos_app, originos_worker;
--> statement-breakpoint

ALTER TABLE core.integration_connections ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.integration_connections FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY integration_connections_select ON core.integration_connections FOR SELECT TO originos_app
  USING (tenant_id = core.current_tenant_id() AND core.member_role(tenant_id) IS NOT NULL);
--> statement-breakpoint
-- Owners and admins connect, attributed to themselves, and only as a live connection.
CREATE POLICY integration_connections_insert ON core.integration_connections FOR INSERT TO originos_app
  WITH CHECK (
    tenant_id = core.current_tenant_id()
    AND core.member_role(tenant_id) IN ('owner', 'admin')
    AND connected_by_user_id = core.current_user_id()
    AND status = 'connected' AND revoked_at IS NULL
  );
--> statement-breakpoint
CREATE POLICY integration_connections_update ON core.integration_connections FOR UPDATE TO originos_app
  USING (tenant_id = core.current_tenant_id() AND core.member_role(tenant_id) IN ('owner', 'admin'))
  WITH CHECK (tenant_id = core.current_tenant_id());
--> statement-breakpoint
CREATE POLICY integration_connections_worker ON core.integration_connections FOR ALL TO originos_worker
  USING (true) WITH CHECK (true);
--> statement-breakpoint

ALTER TABLE core.oauth_states ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.oauth_states FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- An attempt is visible only to the person who started it, in the organization they started it in.
CREATE POLICY oauth_states_own ON core.oauth_states FOR ALL TO originos_app
  USING (tenant_id = core.current_tenant_id() AND user_id = core.current_user_id())
  WITH CHECK (
    tenant_id = core.current_tenant_id()
    AND user_id = core.current_user_id()
    AND core.member_role(tenant_id) IN ('owner', 'admin')
  );
--> statement-breakpoint

ALTER TABLE core.webhook_deliveries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.webhook_deliveries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY webhook_deliveries_select ON core.webhook_deliveries FOR SELECT TO originos_app
  USING (tenant_id = core.current_tenant_id() AND core.member_role(tenant_id) IN ('owner', 'admin'));
--> statement-breakpoint
CREATE POLICY webhook_deliveries_worker ON core.webhook_deliveries FOR SELECT TO originos_worker USING (true);
--> statement-breakpoint

-- Record a verified delivery once. The API checks the signature first; this
-- function then finds the connection (and so the tenant), refuses revoked
-- connections, stores the delivery unless its id was seen before, and appends
-- one outbox event carrying ids only. Returns accepted, duplicate,
-- unknown_connection or revoked.
CREATE FUNCTION core.accept_webhook(
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
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.accept_webhook(text, text, text, text, jsonb, text, integer, text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.accept_webhook(text, text, text, text, jsonb, text, integer, text, text, text)
  TO originos_app;
