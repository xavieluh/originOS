-- Phase 04: application role and row-level security for tenant-owned tables (ADR-010, ADR-023).
--
-- The API and worker connect as the migration owner but switch every pooled
-- connection to `originos_app` (SET ROLE, packages/db createDatabase). That role
-- is not a superuser and does not own the tables, so the policies below always
-- apply to it. Context comes from transaction-local settings written by
-- withScope(): app.user_id, app.tenant_id, app.invitation_token_hash.
--
-- The policies do not trust app.tenant_id alone: tenant rows are visible and
-- writable only when app.user_id is a member of that tenant (and, for
-- management actions, an owner or admin). A bug that sets the wrong tenant
-- therefore still cannot cross organizations.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'originos_app') THEN
    CREATE ROLE originos_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
GRANT originos_app TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA core TO originos_app;
--> statement-breakpoint
-- Account tables are global (not tenant-owned) and used by the auth library.
GRANT SELECT, INSERT, UPDATE, DELETE ON core.users, core.sessions, core.accounts, core.verifications, core.two_factors, core.passkeys TO originos_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON core.organizations TO originos_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON core.memberships TO originos_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON core.invitations TO originos_app;
--> statement-breakpoint
-- Append-only: no UPDATE or DELETE for the application.
GRANT SELECT, INSERT ON core.audit_events TO originos_app;
--> statement-breakpoint
CREATE FUNCTION core.current_tenant_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION core.current_user_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION core.current_invitation_token_hash() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.invitation_token_hash', true), '') $$;
--> statement-breakpoint
-- SECURITY DEFINER helpers read memberships without recursing into its own policies.
-- They only ever answer about core.current_user_id().
CREATE FUNCTION core.member_role(t uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core AS
$$ SELECT m.role FROM core.memberships m WHERE m.tenant_id = t AND m.user_id = core.current_user_id() $$;
--> statement-breakpoint
CREATE FUNCTION core.can_bootstrap_owner(t uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core AS
$$ SELECT EXISTS (SELECT 1 FROM core.organizations o WHERE o.id = t AND o.created_by = core.current_user_id())
      AND NOT EXISTS (SELECT 1 FROM core.memberships m WHERE m.tenant_id = t) $$;
--> statement-breakpoint
CREATE FUNCTION core.invitation_allows(t uuid, r text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core AS
$$ SELECT EXISTS (
     SELECT 1 FROM core.invitations i JOIN core.users u ON u.id = core.current_user_id()
     WHERE i.tenant_id = t AND i.role = r
       AND i.token_hash = core.current_invitation_token_hash()
       AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
       AND u.email_verified AND lower(u.email) = i.email) $$;
--> statement-breakpoint
-- The invitee may see the name of the organization that invited them (and nothing
-- else about it) while holding the token.
CREATE FUNCTION core.invitation_organization_name() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core AS
$$ SELECT o.name FROM core.invitations i JOIN core.organizations o ON o.id = i.tenant_id
   WHERE i.token_hash = core.current_invitation_token_hash() $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.member_role(uuid), core.can_bootstrap_owner(uuid), core.invitation_allows(uuid, text),
  core.invitation_organization_name() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.current_tenant_id(), core.current_user_id(), core.current_invitation_token_hash(),
  core.member_role(uuid), core.can_bootstrap_owner(uuid), core.invitation_allows(uuid, text),
  core.invitation_organization_name() TO originos_app;
--> statement-breakpoint
ALTER TABLE core.organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.organizations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.memberships FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.invitations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.invitations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.audit_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE core.audit_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Organizations: visible to members. Created by the signed-in user with the id
-- already set as the current tenant. Renamed by owners and admins.
CREATE POLICY organizations_select ON core.organizations FOR SELECT TO originos_app
  USING (core.member_role(id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY organizations_insert ON core.organizations FOR INSERT TO originos_app
  WITH CHECK (id = core.current_tenant_id() AND created_by = core.current_user_id());
--> statement-breakpoint
CREATE POLICY organizations_update ON core.organizations FOR UPDATE TO originos_app
  USING (id = core.current_tenant_id() AND core.member_role(id) IN ('owner', 'admin'))
  WITH CHECK (id = core.current_tenant_id());
--> statement-breakpoint
-- Memberships: a person always sees their own (workspace switcher); members see
-- their current tenant's roster.
CREATE POLICY memberships_select ON core.memberships FOR SELECT TO originos_app
  USING (
    user_id = core.current_user_id()
    OR (tenant_id = core.current_tenant_id() AND core.member_role(tenant_id) IS NOT NULL)
  );
--> statement-breakpoint
-- New memberships only via: the creator becoming the first owner, or the signed-in
-- user accepting a valid invitation addressed to their verified email.
CREATE POLICY memberships_insert ON core.memberships FOR INSERT TO originos_app
  WITH CHECK (
    tenant_id = core.current_tenant_id()
    AND user_id = core.current_user_id()
    AND (
      (role = 'owner' AND core.can_bootstrap_owner(tenant_id))
      OR core.invitation_allows(tenant_id, role)
    )
  );
--> statement-breakpoint
-- Role changes by owners and admins. The owner's row can never be changed and
-- no update can create an owner: ownership moves only via core.transfer_ownership().
CREATE POLICY memberships_update ON core.memberships FOR UPDATE TO originos_app
  USING (
    tenant_id = core.current_tenant_id()
    AND core.member_role(tenant_id) IN ('owner', 'admin')
    AND role <> 'owner'
  )
  WITH CHECK (tenant_id = core.current_tenant_id() AND role <> 'owner');
--> statement-breakpoint
-- Owners and admins remove members; anyone may remove their own membership (leave).
-- The owner cannot be removed (or leave) until ownership is transferred.
CREATE POLICY memberships_delete ON core.memberships FOR DELETE TO originos_app
  USING (
    tenant_id = core.current_tenant_id()
    AND role <> 'owner'
    AND (core.member_role(tenant_id) IN ('owner', 'admin') OR user_id = core.current_user_id())
  );
--> statement-breakpoint
-- Ownership transfer: only the current owner of the current tenant, only to an
-- existing member. The old owner becomes an admin. Returns false if not allowed.
CREATE FUNCTION core.transfer_ownership(new_owner uuid) RETURNS boolean LANGUAGE plpgsql
SECURITY DEFINER SET search_path = pg_catalog, core AS
$$
DECLARE
  t uuid := core.current_tenant_id();
  me uuid := core.current_user_id();
BEGIN
  IF t IS NULL OR me IS NULL OR new_owner = me THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM core.memberships WHERE tenant_id = t AND user_id = me AND role = 'owner') THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM core.memberships WHERE tenant_id = t AND user_id = new_owner) THEN
    RETURN false;
  END IF;
  UPDATE core.memberships SET role = 'admin', updated_at = now() WHERE tenant_id = t AND user_id = me;
  UPDATE core.memberships SET role = 'owner', updated_at = now() WHERE tenant_id = t AND user_id = new_owner;
  RETURN true;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.transfer_ownership(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.transfer_ownership(uuid) TO originos_app;
--> statement-breakpoint
-- Invitations: managed by owners and admins of the current tenant; the invitee sees
-- and accepts exactly the one invitation whose token they hold.
CREATE POLICY invitations_select ON core.invitations FOR SELECT TO originos_app
  USING (
    (tenant_id = core.current_tenant_id() AND core.member_role(tenant_id) IN ('owner', 'admin'))
    OR token_hash = core.current_invitation_token_hash()
  );
--> statement-breakpoint
CREATE POLICY invitations_insert ON core.invitations FOR INSERT TO originos_app
  WITH CHECK (
    tenant_id = core.current_tenant_id()
    AND core.member_role(tenant_id) IN ('owner', 'admin')
    AND invited_by = core.current_user_id()
  );
--> statement-breakpoint
CREATE POLICY invitations_update ON core.invitations FOR UPDATE TO originos_app
  USING (
    (tenant_id = core.current_tenant_id() AND core.member_role(tenant_id) IN ('owner', 'admin'))
    OR token_hash = core.current_invitation_token_hash()
  )
  WITH CHECK (
    (tenant_id = core.current_tenant_id() AND core.member_role(tenant_id) IN ('owner', 'admin'))
    OR (token_hash = core.current_invitation_token_hash() AND accepted_by = core.current_user_id())
  );
--> statement-breakpoint
CREATE POLICY audit_events_select ON core.audit_events FOR SELECT TO originos_app
  USING (tenant_id = core.current_tenant_id() AND core.member_role(tenant_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY audit_events_insert ON core.audit_events FOR INSERT TO originos_app
  WITH CHECK (
    tenant_id = core.current_tenant_id()
    AND core.member_role(tenant_id) IS NOT NULL
    AND actor_user_id = core.current_user_id()
  );
