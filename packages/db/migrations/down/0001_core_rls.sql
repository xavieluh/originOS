-- Reverses 0001. The originos_app role is cluster-wide and is kept; its grants
-- in this database are removed.
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'core' LOOP
    EXECUTE format('DROP POLICY %I ON core.%I', p.policyname, p.tablename);
  END LOOP;
END
$$;
--> statement-breakpoint
ALTER TABLE core.organizations NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.memberships NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.invitations NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.audit_events NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP FUNCTION IF EXISTS core.transfer_ownership(uuid);
--> statement-breakpoint
DROP FUNCTION IF EXISTS core.invitation_organization_name();
--> statement-breakpoint
DROP FUNCTION IF EXISTS core.invitation_allows(uuid, text);
--> statement-breakpoint
DROP FUNCTION IF EXISTS core.can_bootstrap_owner(uuid);
--> statement-breakpoint
DROP FUNCTION IF EXISTS core.member_role(uuid);
--> statement-breakpoint
DROP FUNCTION IF EXISTS core.current_invitation_token_hash();
--> statement-breakpoint
DROP FUNCTION IF EXISTS core.current_user_id();
--> statement-breakpoint
DROP FUNCTION IF EXISTS core.current_tenant_id();
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA core FROM originos_app;
--> statement-breakpoint
REVOKE USAGE ON SCHEMA core FROM originos_app;
