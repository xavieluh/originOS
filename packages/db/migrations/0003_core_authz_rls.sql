-- Phase 05: row-level security for agents, permission grants and consents (ADR-023, ADR-024).
-- Same model as 0001: rows are visible only to members of the tenant, management
-- needs owner or admin, and history is never edited: the application role can
-- only *revoke* grants and consents (column-level UPDATE privileges), not change them.

GRANT SELECT, INSERT ON core.agents, core.permission_grants, core.consents TO originos_app;
--> statement-breakpoint
GRANT UPDATE (name, description, status, disabled_at, disabled_by, updated_at) ON core.agents TO originos_app;
--> statement-breakpoint
GRANT UPDATE (revoked_at, revoked_by) ON core.permission_grants, core.consents TO originos_app;
--> statement-breakpoint
-- Whether a grant subject belongs to the tenant: a current member, or an agent of it.
CREATE FUNCTION core.grant_subject_in_tenant(t uuid, subject_type text, subject_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, core AS
$$ SELECT CASE subject_type
     WHEN 'user' THEN EXISTS (SELECT 1 FROM core.memberships m WHERE m.tenant_id = t AND m.user_id = subject_id)
     WHEN 'agent' THEN EXISTS (SELECT 1 FROM core.agents a WHERE a.tenant_id = t AND a.id = subject_id)
     ELSE false END $$;
--> statement-breakpoint
-- Whether the current user owns the given agent (members see grants on their own agents).
CREATE FUNCTION core.owns_agent(agent_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, core AS
$$ SELECT EXISTS (SELECT 1 FROM core.agents a WHERE a.id = agent_id AND a.owner_user_id = core.current_user_id()) $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.grant_subject_in_tenant(uuid, text, uuid), core.owns_agent(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.grant_subject_in_tenant(uuid, text, uuid), core.owns_agent(uuid) TO originos_app;
--> statement-breakpoint
ALTER TABLE core.agents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.agents FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.permission_grants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.permission_grants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.consents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.consents FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Agents: members of the tenant see them; any member registers agents they own;
-- the owner of an agent, or an owner/admin, may rename or disable it.
CREATE POLICY agents_select ON core.agents FOR SELECT TO originos_app
  USING (tenant_id = core.current_tenant_id() AND core.member_role(tenant_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY agents_insert ON core.agents FOR INSERT TO originos_app
  WITH CHECK (
    tenant_id = core.current_tenant_id()
    AND core.member_role(tenant_id) IS NOT NULL
    AND owner_user_id = core.current_user_id()
    AND status = 'active'
  );
--> statement-breakpoint
CREATE POLICY agents_update ON core.agents FOR UPDATE TO originos_app
  USING (
    tenant_id = core.current_tenant_id()
    AND core.member_role(tenant_id) IS NOT NULL
    AND (owner_user_id = core.current_user_id() OR core.member_role(tenant_id) IN ('owner', 'admin'))
  )
  WITH CHECK (tenant_id = core.current_tenant_id());
--> statement-breakpoint
-- Grants: owners and admins see and manage all of the tenant's grants; everyone
-- sees grants about themselves and about agents they own.
CREATE POLICY permission_grants_select ON core.permission_grants FOR SELECT TO originos_app
  USING (
    tenant_id = core.current_tenant_id()
    AND core.member_role(tenant_id) IS NOT NULL
    AND (
      core.member_role(tenant_id) IN ('owner', 'admin')
      OR (subject_type = 'user' AND subject_id = core.current_user_id())
      OR (subject_type = 'agent' AND core.owns_agent(subject_id))
    )
  );
--> statement-breakpoint
CREATE POLICY permission_grants_insert ON core.permission_grants FOR INSERT TO originos_app
  WITH CHECK (
    tenant_id = core.current_tenant_id()
    AND core.member_role(tenant_id) IN ('owner', 'admin')
    AND created_by = core.current_user_id()
    AND revoked_at IS NULL
    AND core.grant_subject_in_tenant(tenant_id, subject_type, subject_id)
    -- Ownership-level administration is never grantable (the owner role alone holds it).
    AND NOT (effect = 'allow' AND resource_type IN ('organization', '*') AND 'admin' = ANY (actions))
  );
--> statement-breakpoint
CREATE POLICY permission_grants_revoke ON core.permission_grants FOR UPDATE TO originos_app
  USING (
    tenant_id = core.current_tenant_id()
    AND core.member_role(tenant_id) IN ('owner', 'admin')
    AND revoked_at IS NULL
  )
  WITH CHECK (revoked_at IS NOT NULL AND revoked_by = core.current_user_id());
--> statement-breakpoint
-- Consents: a person sees and changes only their own personal consents; organization
-- policies are visible to members and changed by owners and admins.
CREATE POLICY consents_select ON core.consents FOR SELECT TO originos_app
  USING (
    tenant_id = core.current_tenant_id()
    AND core.member_role(tenant_id) IS NOT NULL
    AND ((subject_type = 'user' AND user_id = core.current_user_id()) OR subject_type = 'organization')
  );
--> statement-breakpoint
CREATE POLICY consents_insert ON core.consents FOR INSERT TO originos_app
  WITH CHECK (
    tenant_id = core.current_tenant_id()
    AND granted_by = core.current_user_id()
    AND revoked_at IS NULL
    AND (
      (subject_type = 'user' AND user_id = core.current_user_id() AND core.member_role(tenant_id) IS NOT NULL)
      OR (subject_type = 'organization' AND core.member_role(tenant_id) IN ('owner', 'admin'))
    )
  );
--> statement-breakpoint
CREATE POLICY consents_revoke ON core.consents FOR UPDATE TO originos_app
  USING (
    tenant_id = core.current_tenant_id()
    AND revoked_at IS NULL
    AND (
      (subject_type = 'user' AND user_id = core.current_user_id() AND core.member_role(tenant_id) IS NOT NULL)
      OR (subject_type = 'organization' AND core.member_role(tenant_id) IN ('owner', 'admin'))
    )
  )
  WITH CHECK (revoked_at IS NOT NULL AND revoked_by = core.current_user_id());
