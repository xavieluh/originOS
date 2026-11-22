-- Reverses 0003.
DROP POLICY IF EXISTS consents_revoke ON core.consents;
--> statement-breakpoint
DROP POLICY IF EXISTS consents_insert ON core.consents;
--> statement-breakpoint
DROP POLICY IF EXISTS consents_select ON core.consents;
--> statement-breakpoint
DROP POLICY IF EXISTS permission_grants_revoke ON core.permission_grants;
--> statement-breakpoint
DROP POLICY IF EXISTS permission_grants_insert ON core.permission_grants;
--> statement-breakpoint
DROP POLICY IF EXISTS permission_grants_select ON core.permission_grants;
--> statement-breakpoint
DROP POLICY IF EXISTS agents_update ON core.agents;
--> statement-breakpoint
DROP POLICY IF EXISTS agents_insert ON core.agents;
--> statement-breakpoint
DROP POLICY IF EXISTS agents_select ON core.agents;
--> statement-breakpoint
ALTER TABLE core.agents NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.permission_grants NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.consents NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP FUNCTION IF EXISTS core.owns_agent(uuid);
--> statement-breakpoint
DROP FUNCTION IF EXISTS core.grant_subject_in_tenant(uuid, text, uuid);
--> statement-breakpoint
REVOKE ALL ON core.agents, core.permission_grants, core.consents FROM originos_app;
