-- Reverses 0009.
DROP FUNCTION IF EXISTS core.accept_webhook(text, text, text, text, jsonb, text, integer, text, text, text);
--> statement-breakpoint
DROP POLICY IF EXISTS webhook_deliveries_worker ON core.webhook_deliveries;
--> statement-breakpoint
DROP POLICY IF EXISTS webhook_deliveries_select ON core.webhook_deliveries;
--> statement-breakpoint
DROP POLICY IF EXISTS oauth_states_own ON core.oauth_states;
--> statement-breakpoint
DROP POLICY IF EXISTS integration_connections_worker ON core.integration_connections;
--> statement-breakpoint
DROP POLICY IF EXISTS integration_connections_update ON core.integration_connections;
--> statement-breakpoint
DROP POLICY IF EXISTS integration_connections_insert ON core.integration_connections;
--> statement-breakpoint
DROP POLICY IF EXISTS integration_connections_select ON core.integration_connections;
--> statement-breakpoint
ALTER TABLE core.webhook_deliveries DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.oauth_states DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.integration_connections DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON core.integration_connections, core.oauth_states, core.webhook_deliveries
  FROM originos_app, originos_worker;
