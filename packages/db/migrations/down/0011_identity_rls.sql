-- Reverses 0011.
DROP FUNCTION IF EXISTS trust.public_profile_reviews(text);
--> statement-breakpoint
DROP FUNCTION IF EXISTS trust.public_profile_proofs(text);
--> statement-breakpoint
DROP FUNCTION IF EXISTS trust.public_profile(text);
--> statement-breakpoint
DROP FUNCTION IF EXISTS trust.mark_control_moved(text);
--> statement-breakpoint
DROP FUNCTION IF EXISTS trust.record_domain_check(text, boolean, text, text, text, text, text);
--> statement-breakpoint
DROP TRIGGER IF EXISTS guard_review_update ON trust.identity_reviews;
--> statement-breakpoint
DROP TRIGGER IF EXISTS guard_proof_update ON trust.identity_proofs;
--> statement-breakpoint
DROP TRIGGER IF EXISTS guard_profile_update ON trust.profiles;
--> statement-breakpoint
DROP FUNCTION IF EXISTS trust.guard_review_update();
--> statement-breakpoint
DROP FUNCTION IF EXISTS trust.guard_proof_update();
--> statement-breakpoint
DROP FUNCTION IF EXISTS trust.guard_profile_update();
--> statement-breakpoint
DROP POLICY IF EXISTS oauth_states_own ON core.oauth_states;
--> statement-breakpoint
CREATE POLICY oauth_states_own ON core.oauth_states FOR ALL TO originos_app
  USING (tenant_id = core.current_tenant_id() AND user_id = core.current_user_id())
  WITH CHECK (
    tenant_id = core.current_tenant_id()
    AND user_id = core.current_user_id()
    AND core.member_role(tenant_id) IN ('owner', 'admin')
  );
--> statement-breakpoint
DROP POLICY IF EXISTS identity_reviews_update ON trust.identity_reviews;
--> statement-breakpoint
DROP POLICY IF EXISTS identity_reviews_insert ON trust.identity_reviews;
--> statement-breakpoint
DROP POLICY IF EXISTS identity_reviews_select ON trust.identity_reviews;
--> statement-breakpoint
DROP POLICY IF EXISTS identity_proofs_worker ON trust.identity_proofs;
--> statement-breakpoint
DROP POLICY IF EXISTS identity_proofs_update ON trust.identity_proofs;
--> statement-breakpoint
DROP POLICY IF EXISTS identity_proofs_insert ON trust.identity_proofs;
--> statement-breakpoint
DROP POLICY IF EXISTS identity_proofs_select ON trust.identity_proofs;
--> statement-breakpoint
DROP POLICY IF EXISTS profiles_update ON trust.profiles;
--> statement-breakpoint
DROP POLICY IF EXISTS profiles_insert ON trust.profiles;
--> statement-breakpoint
DROP POLICY IF EXISTS profiles_select ON trust.profiles;
--> statement-breakpoint
ALTER TABLE trust.identity_reviews DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE trust.identity_proofs DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE trust.profiles DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE INSERT ON core.jobs FROM originos_worker;
--> statement-breakpoint
REVOKE USAGE ON SCHEMA trust FROM originos_worker;
--> statement-breakpoint
REVOKE ALL ON trust.profiles, trust.identity_proofs, trust.identity_reviews FROM originos_app, originos_worker;
--> statement-breakpoint
DROP FUNCTION IF EXISTS trust.can_see_profile(text);
--> statement-breakpoint
DROP FUNCTION IF EXISTS trust.can_manage_profile(text);
