-- Reverses 0008: drops the Origin Connect tables and their data.
DROP TABLE IF EXISTS core.webhook_deliveries;
--> statement-breakpoint
DROP TABLE IF EXISTS core.oauth_states;
--> statement-breakpoint
DROP TABLE IF EXISTS core.integration_connections;
