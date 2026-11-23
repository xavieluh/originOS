-- Phase 09 (ADR-028): privileges, row-level security and guards for IdentityMesh.
-- Reverse: down/0011_identity_rls.sql.
--
-- Rules the database enforces, whatever the API does:
--  * only the worker's challenge check can mark a domain proof verified
--    (trust.record_domain_check); the application role can only create a
--    pending domain proof and withdraw it;
--  * a revoked proof stays revoked;
--  * nobody decides their own review request; decisions name who, when and why
--    and cannot be edited afterwards;
--  * only owners and admins moderate profiles, and a suspended profile cannot
--    be edited by its owner;
--  * a profile changes owner only together with an approved ownership request
--    decided in the same transaction;
--  * public pages read through SECURITY DEFINER functions that return public,
--    active profiles and their public proofs and reviews only.

-- 1. Helpers ------------------------------------------------------------------
-- Whether the current person manages this profile: their own creator profile,
-- or (owners and admins) the organization's profile.
CREATE FUNCTION trust.can_manage_profile(p_profile_id text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core, trust AS
$$ SELECT EXISTS (
     SELECT 1 FROM trust.profiles p
     JOIN trust.subjects s ON s.tenant_id = p.tenant_id AND s.id = p.subject_id
     WHERE p.id = p_profile_id
       AND p.tenant_id = core.current_tenant_id()
       AND core.member_role(p.tenant_id) IS NOT NULL
       AND ((p.kind = 'creator' AND s.user_id = core.current_user_id())
            OR (p.kind = 'organization' AND core.member_role(p.tenant_id) IN ('owner', 'admin')))) $$;
--> statement-breakpoint
-- Whether the current person may see this profile inside the organization.
CREATE FUNCTION trust.can_see_profile(p_profile_id text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core, trust AS
$$ SELECT EXISTS (
     SELECT 1 FROM trust.profiles p
     WHERE p.id = p_profile_id
       AND p.tenant_id = core.current_tenant_id()
       AND core.member_role(p.tenant_id) IS NOT NULL
       AND (p.visibility <> 'private'
            OR core.member_role(p.tenant_id) IN ('owner', 'admin')
            OR trust.can_manage_profile(p.id))) $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION trust.can_manage_profile(text), trust.can_see_profile(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION trust.can_manage_profile(text), trust.can_see_profile(text) TO originos_app;
--> statement-breakpoint

-- 2. Grants: no DELETE anywhere; updates limited to state columns -------------
GRANT SELECT, INSERT ON trust.profiles, trust.identity_proofs, trust.identity_reviews TO originos_app;
--> statement-breakpoint
GRANT UPDATE (subject_id, handle, display_name, bio, visibility, pseudonymous, discoverable, moderation_state,
  moderation_reason, moderated_at, moderated_by_user_id, updated_at) ON trust.profiles TO originos_app;
--> statement-breakpoint
GRANT UPDATE (status, visibility, label, first_verified_at, last_verified_at, expires_at, last_checked_at,
  last_check_error, check_count, stale_reason, stale_at, revoked_at, revoked_reason, revoked_by_user_id, claim_id,
  updated_at) ON trust.identity_proofs TO originos_app;
--> statement-breakpoint
GRANT UPDATE (status, decided_by_user_id, decided_at, decision_reason, claim_id, revoked_at, revoked_reason,
  revoked_by_user_id, updated_at) ON trust.identity_reviews TO originos_app;
--> statement-breakpoint
-- The worker reads what a domain check needs and schedules re-checks; results go through record_domain_check().
GRANT USAGE ON SCHEMA trust TO originos_worker;
--> statement-breakpoint
GRANT SELECT (id, tenant_id, profile_id, kind, method, target, label, challenge, status, expires_at)
  ON trust.identity_proofs TO originos_worker;
--> statement-breakpoint
GRANT INSERT ON core.jobs TO originos_worker;
--> statement-breakpoint

-- 3. Row-level security -------------------------------------------------------
ALTER TABLE trust.profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE trust.profiles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- The owner check is inline (not trust.can_manage_profile) so INSERT ... RETURNING sees a new private profile.
CREATE POLICY profiles_select ON trust.profiles FOR SELECT TO originos_app
  USING (tenant_id = core.current_tenant_id() AND core.member_role(tenant_id) IS NOT NULL
         AND (visibility <> 'private' OR core.member_role(tenant_id) IN ('owner', 'admin')
              OR EXISTS (SELECT 1 FROM trust.subjects s WHERE s.tenant_id = profiles.tenant_id
                           AND s.id = profiles.subject_id AND s.user_id = core.current_user_id())));
--> statement-breakpoint
-- A person creates their own creator profile; owners and admins create the organization's profile.
CREATE POLICY profiles_insert ON trust.profiles FOR INSERT TO originos_app
  WITH CHECK (
    tenant_id = core.current_tenant_id()
    AND core.member_role(tenant_id) IS NOT NULL
    AND created_by_user_id = core.current_user_id()
    AND moderation_state = 'active'
    AND CASE kind
      WHEN 'creator' THEN EXISTS (
        SELECT 1 FROM trust.subjects s WHERE s.tenant_id = profiles.tenant_id AND s.id = profiles.subject_id
          AND s.kind = 'human' AND s.user_id = core.current_user_id())
      WHEN 'organization' THEN core.member_role(tenant_id) IN ('owner', 'admin') AND EXISTS (
        SELECT 1 FROM trust.subjects s WHERE s.tenant_id = profiles.tenant_id AND s.id = profiles.subject_id
          AND s.kind = 'organization')
      ELSE false
    END
  );
--> statement-breakpoint
CREATE POLICY profiles_update ON trust.profiles FOR UPDATE TO originos_app
  USING (tenant_id = core.current_tenant_id() AND core.member_role(tenant_id) IS NOT NULL
         AND (trust.can_manage_profile(id) OR core.member_role(tenant_id) IN ('owner', 'admin')))
  WITH CHECK (tenant_id = core.current_tenant_id());
--> statement-breakpoint

ALTER TABLE trust.identity_proofs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE trust.identity_proofs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY identity_proofs_select ON trust.identity_proofs FOR SELECT TO originos_app
  USING (tenant_id = core.current_tenant_id() AND trust.can_see_profile(profile_id));
--> statement-breakpoint
-- Domain proofs start pending (only the worker verifies them). Account proofs are
-- recorded verified by the API after the OAuth exchange it performed itself.
CREATE POLICY identity_proofs_insert ON trust.identity_proofs FOR INSERT TO originos_app
  WITH CHECK (
    tenant_id = core.current_tenant_id()
    AND created_by_user_id = core.current_user_id()
    AND trust.can_manage_profile(profile_id)
    AND revoked_at IS NULL
    AND ((kind = 'domain' AND status = 'pending' AND first_verified_at IS NULL AND last_verified_at IS NULL
          AND expires_at IS NULL AND claim_id IS NULL AND check_count = 0)
         OR (kind = 'account' AND status = 'verified'))
  );
--> statement-breakpoint
CREATE POLICY identity_proofs_update ON trust.identity_proofs FOR UPDATE TO originos_app
  USING (tenant_id = core.current_tenant_id() AND core.member_role(tenant_id) IS NOT NULL
         AND (trust.can_manage_profile(profile_id) OR core.member_role(tenant_id) IN ('owner', 'admin')))
  WITH CHECK (tenant_id = core.current_tenant_id());
--> statement-breakpoint
CREATE POLICY identity_proofs_worker ON trust.identity_proofs FOR SELECT TO originos_worker USING (true);
--> statement-breakpoint

ALTER TABLE trust.identity_reviews ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE trust.identity_reviews FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Requesters, the profile's manager and the organization's owners and admins see a request.
CREATE POLICY identity_reviews_select ON trust.identity_reviews FOR SELECT TO originos_app
  USING (tenant_id = core.current_tenant_id() AND core.member_role(tenant_id) IS NOT NULL
         AND (requested_by_user_id = core.current_user_id()
              OR core.member_role(tenant_id) IN ('owner', 'admin')
              OR trust.can_manage_profile(profile_id)));
--> statement-breakpoint
-- Claims are requested for a profile you manage; ownership of a creator profile you do not.
CREATE POLICY identity_reviews_insert ON trust.identity_reviews FOR INSERT TO originos_app
  WITH CHECK (
    tenant_id = core.current_tenant_id()
    AND core.member_role(tenant_id) IS NOT NULL
    AND requested_by_user_id = core.current_user_id()
    AND core.can_act_as(requested_by_subject_id)
    AND status = 'pending' AND decided_at IS NULL AND decided_by_user_id IS NULL AND claim_id IS NULL
    AND revoked_at IS NULL
    AND CASE kind
      WHEN 'claim' THEN trust.can_manage_profile(profile_id)
      WHEN 'ownership' THEN NOT trust.can_manage_profile(profile_id) AND EXISTS (
        SELECT 1 FROM trust.profiles p WHERE p.tenant_id = identity_reviews.tenant_id
          AND p.id = identity_reviews.profile_id AND p.kind = 'creator')
      ELSE false
    END
  );
--> statement-breakpoint
CREATE POLICY identity_reviews_update ON trust.identity_reviews FOR UPDATE TO originos_app
  USING (tenant_id = core.current_tenant_id() AND core.member_role(tenant_id) IS NOT NULL
         AND (core.member_role(tenant_id) IN ('owner', 'admin') OR requested_by_user_id = core.current_user_id()))
  WITH CHECK (tenant_id = core.current_tenant_id());
--> statement-breakpoint

-- Members may start an OAuth attempt to prove an account on a profile they manage;
-- organization connections stay with owners and admins.
DROP POLICY oauth_states_own ON core.oauth_states;
--> statement-breakpoint
CREATE POLICY oauth_states_own ON core.oauth_states FOR ALL TO originos_app
  USING (tenant_id = core.current_tenant_id() AND user_id = core.current_user_id())
  WITH CHECK (
    tenant_id = core.current_tenant_id()
    AND user_id = core.current_user_id()
    AND ((purpose = 'connect' AND core.member_role(tenant_id) IN ('owner', 'admin'))
         OR (purpose = 'identity_proof' AND trust.can_manage_profile(profile_id)))
  );
--> statement-breakpoint

-- 4. Guards on updates by the application role --------------------------------
CREATE FUNCTION trust.guard_profile_update() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, core, trust AS
$$
DECLARE
  is_admin boolean;
BEGIN
  IF current_user <> 'originos_app' THEN
    RETURN NEW;
  END IF;
  is_admin := core.member_role(OLD.tenant_id) IN ('owner', 'admin');
  IF (NEW.moderation_state, NEW.moderation_reason, NEW.moderated_at, NEW.moderated_by_user_id)
     IS DISTINCT FROM (OLD.moderation_state, OLD.moderation_reason, OLD.moderated_at, OLD.moderated_by_user_id)
     AND NOT is_admin THEN
    RAISE EXCEPTION 'only owners and admins moderate profiles' USING ERRCODE = '42501';
  END IF;
  IF OLD.moderation_state = 'suspended' AND NOT is_admin THEN
    RAISE EXCEPTION 'this profile is suspended' USING ERRCODE = '42501';
  END IF;
  IF NEW.subject_id IS DISTINCT FROM OLD.subject_id THEN
    IF NOT is_admin OR NOT EXISTS (
      SELECT 1 FROM trust.identity_reviews r
      JOIN trust.subjects s ON s.tenant_id = r.tenant_id AND s.id = r.requested_by_subject_id
      WHERE r.tenant_id = OLD.tenant_id AND r.profile_id = OLD.id AND r.kind = 'ownership'
        AND r.status = 'approved' AND r.requested_by_subject_id = NEW.subject_id
        AND r.decided_by_user_id = core.current_user_id() AND r.decided_at = now()
        AND s.kind = 'human')
    THEN
      RAISE EXCEPTION 'a profile changes owner only through an approved ownership request' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER guard_profile_update BEFORE UPDATE ON trust.profiles
  FOR EACH ROW EXECUTE FUNCTION trust.guard_profile_update();
--> statement-breakpoint

CREATE FUNCTION trust.guard_proof_update() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, core, trust AS
$$
BEGIN
  IF OLD.status = 'revoked' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'a revoked proof stays revoked' USING ERRCODE = '42501';
  END IF;
  IF current_user <> 'originos_app' THEN
    RETURN NEW;
  END IF;
  IF OLD.kind = 'domain' THEN
    -- Only withdrawal or a visibility change: verification is the worker's alone.
    IF NEW.status NOT IN (OLD.status, 'revoked')
       OR (NEW.first_verified_at, NEW.last_verified_at, NEW.expires_at, NEW.last_checked_at, NEW.last_check_error,
           NEW.check_count, NEW.stale_reason, NEW.stale_at, NEW.claim_id, NEW.label)
          IS DISTINCT FROM
          (OLD.first_verified_at, OLD.last_verified_at, OLD.expires_at, OLD.last_checked_at, OLD.last_check_error,
           OLD.check_count, OLD.stale_reason, OLD.stale_at, OLD.claim_id, OLD.label)
    THEN
      RAISE EXCEPTION 'domain proofs are verified only by a successful challenge check' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.status = 'revoked' AND OLD.status <> 'revoked'
     AND (NEW.revoked_by_user_id IS DISTINCT FROM core.current_user_id()) THEN
    RAISE EXCEPTION 'revocations name who revoked' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER guard_proof_update BEFORE UPDATE ON trust.identity_proofs
  FOR EACH ROW EXECUTE FUNCTION trust.guard_proof_update();
--> statement-breakpoint

CREATE FUNCTION trust.guard_review_update() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, core, trust AS
$$
DECLARE
  me uuid := core.current_user_id();
  is_admin boolean;
BEGIN
  IF current_user <> 'originos_app' THEN
    RETURN NEW;
  END IF;
  is_admin := core.member_role(OLD.tenant_id) IN ('owner', 'admin');
  IF OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected') THEN
    IF NOT is_admin OR me IS NULL OR me = OLD.requested_by_user_id OR NEW.decided_by_user_id IS DISTINCT FROM me THEN
      RAISE EXCEPTION 'requests are decided by an owner or admin who did not make them' USING ERRCODE = '42501';
    END IF;
  ELSIF OLD.status = 'pending' AND NEW.status = 'withdrawn' THEN
    IF me IS DISTINCT FROM OLD.requested_by_user_id OR NEW.decided_by_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'only the requester withdraws a request' USING ERRCODE = '42501';
    END IF;
  ELSIF OLD.status = 'approved' AND NEW.status = 'revoked' AND OLD.kind = 'claim' THEN
    IF NOT is_admin OR NEW.revoked_by_user_id IS DISTINCT FROM me
       OR (NEW.decided_by_user_id, NEW.decided_at, NEW.decision_reason, NEW.claim_id)
          IS DISTINCT FROM (OLD.decided_by_user_id, OLD.decided_at, OLD.decision_reason, OLD.claim_id) THEN
      RAISE EXCEPTION 'owners and admins revoke reviewed claims, and decisions stay as recorded' USING ERRCODE = '42501';
    END IF;
  ELSIF OLD.status = 'approved' AND NEW.status = 'approved' AND OLD.kind = 'claim'
        AND OLD.claim_id IS NULL AND NEW.claim_id IS NOT NULL
        AND (NEW.decided_by_user_id, NEW.decided_at, NEW.decision_reason)
            IS NOT DISTINCT FROM (OLD.decided_by_user_id, OLD.decided_at, OLD.decision_reason)
        AND OLD.decided_by_user_id = me THEN
    -- The decider links the identity claim the approval recorded.
    RETURN NEW;
  ELSIF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'review decisions are not edited' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER guard_review_update BEFORE UPDATE ON trust.identity_reviews
  FOR EACH ROW EXECUTE FUNCTION trust.guard_review_update();
--> statement-breakpoint

-- 5. Recording a domain check (worker) ----------------------------------------
-- The only path that verifies a domain proof. On success it records a
-- canonical identity claim (assurance domain_or_account_controlled, capture
-- method challenge), supersedes the previous one, extends the expiry by 90
-- days, marks the same domain stale on every other profile (control may have
-- moved), and appends an outbox event and an audit event. On failure a
-- verified proof becomes stale with the reason; a pending one keeps the error.
-- Returns the proof's new status, or unknown / revoked.
CREATE FUNCTION trust.record_domain_check(
  p_proof_id text, p_ok boolean, p_mechanism text, p_detail text, p_claim_id text, p_event_id text,
  p_correlation_id text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, core, trust AS
$$
DECLARE
  pr trust.identity_proofs;
  pf trust.profiles;
  v_now timestamptz := clock_timestamp();
  v_day text := to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD');
BEGIN
  SELECT * INTO pr FROM trust.identity_proofs WHERE id = p_proof_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'unknown';
  END IF;
  IF pr.kind <> 'domain' THEN
    RAISE EXCEPTION 'record_domain_check is for domain proofs';
  END IF;
  IF pr.status = 'revoked' THEN
    RETURN 'revoked';
  END IF;
  SELECT * INTO pf FROM trust.profiles WHERE id = pr.profile_id;

  IF p_ok THEN
    INSERT INTO trust.identity_claims (id, tenant_id, created_by_subject_id, visibility, source_provider,
        first_seen_at, asserted_by_subject_id, capture_method, validation_mechanism, assurance, limitations,
        subject_id, claim_type, value)
    VALUES (p_claim_id, pr.tenant_id, pf.subject_id, pr.visibility, CASE pr.method WHEN 'dns_txt' THEN 'dns' ELSE 'https' END,
        v_now, pf.subject_id, 'challenge', p_mechanism, 'domain_or_account_controlled',
        'Shows that whoever controlled ' || pr.label || ' published the OriginOS challenge on ' || v_day
          || '. It does not show legal ownership of the domain or anyone''s legal identity.',
        pf.subject_id, 'domain_control', pr.target);
    IF pr.claim_id IS NOT NULL THEN
      UPDATE trust.identity_claims SET superseded_by_id = p_claim_id, updated_at = v_now
       WHERE tenant_id = pr.tenant_id AND id = pr.claim_id;
    END IF;
    UPDATE trust.identity_proofs SET status = 'verified', first_verified_at = coalesce(first_verified_at, v_now),
        last_verified_at = v_now, expires_at = v_now + interval '90 days', last_checked_at = v_now,
        last_check_error = NULL, check_count = check_count + 1, stale_reason = NULL, stale_at = NULL,
        claim_id = p_claim_id, updated_at = v_now
     WHERE id = pr.id;
    UPDATE trust.identity_proofs SET status = 'stale', stale_at = v_now, updated_at = v_now,
        stale_reason = 'Another profile proved control of ' || pr.label || ' on ' || v_day || '. Control may have changed.'
     WHERE kind = pr.kind AND target = pr.target AND id <> pr.id AND status = 'verified';
    INSERT INTO core.outbox_events (id, tenant_id, type, subject_ref, payload, correlation_id)
    VALUES (p_event_id, pr.tenant_id, 'identity.proof_verified', pr.id,
      jsonb_build_object('proofId', pr.id, 'profileId', pr.profile_id, 'claimId', p_claim_id, 'kind', pr.kind),
      p_correlation_id);
    INSERT INTO core.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata, correlation_id)
    VALUES (pr.tenant_id, NULL, 'identity.proof_verified', 'identity_proof', pr.id,
      jsonb_build_object('method', pr.method, 'claimId', p_claim_id), p_correlation_id);
    RETURN 'verified';
  END IF;

  UPDATE trust.identity_proofs SET last_checked_at = v_now, last_check_error = left(p_detail, 500),
      check_count = check_count + 1, updated_at = v_now,
      status = CASE WHEN status = 'verified' THEN 'stale' ELSE status END,
      stale_at = CASE WHEN status = 'verified' THEN v_now ELSE stale_at END,
      stale_reason = CASE WHEN status = 'verified'
        THEN left('The re-check on ' || v_day || ' failed: ' || p_detail, 500) ELSE stale_reason END
   WHERE id = pr.id
   RETURNING * INTO pr;
  INSERT INTO core.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata, correlation_id)
  VALUES (pr.tenant_id, NULL, 'identity.proof_check_failed', 'identity_proof', pr.id,
    jsonb_build_object('method', pr.method, 'status', pr.status), p_correlation_id);
  RETURN pr.status;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION trust.record_domain_check(text, boolean, text, text, text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION trust.record_domain_check(text, boolean, text, text, text, text, text) TO originos_worker;
--> statement-breakpoint

-- After the API records a verified account proof, mark the same account stale on
-- every other profile (in any organization). Only for a proof of the current
-- organization verified in the last five minutes. Returns how many it marked.
CREATE FUNCTION trust.mark_control_moved(p_proof_id text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, trust AS
$$
DECLARE
  pr trust.identity_proofs;
  n integer;
BEGIN
  SELECT * INTO pr FROM trust.identity_proofs
   WHERE id = p_proof_id AND tenant_id = core.current_tenant_id() AND status = 'verified'
     AND last_verified_at > clock_timestamp() - interval '5 minutes';
  IF NOT FOUND OR NOT trust.can_manage_profile(pr.profile_id) THEN
    RETURN 0;
  END IF;
  UPDATE trust.identity_proofs SET status = 'stale', stale_at = clock_timestamp(), updated_at = clock_timestamp(),
      stale_reason = 'Another profile proved control of ' || pr.label || ' on '
        || to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD') || '. Control may have changed.'
   WHERE kind = pr.kind AND target = pr.target AND id <> pr.id AND status = 'verified';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION trust.mark_control_moved(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION trust.mark_control_moved(text) TO originos_app;
--> statement-breakpoint

-- 6. Public reads -------------------------------------------------------------
-- A public, active profile by handle: presentation fields only (no subject,
-- user or tenant ids, no account names).
CREATE FUNCTION trust.public_profile(p_handle text)
RETURNS TABLE (id text, kind text, handle text, display_name text, bio text, pseudonymous boolean,
               discoverable boolean, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, trust AS
$$ SELECT p.id, p.kind, p.handle, p.display_name, p.bio, p.pseudonymous, p.discoverable, p.updated_at
     FROM trust.profiles p
    WHERE p.handle = p_handle AND p.visibility = 'public' AND p.moderation_state = 'active' $$;
--> statement-breakpoint
-- The public proofs of a public, active profile (any status: lapsed ones are shown, labeled).
CREATE FUNCTION trust.public_profile_proofs(p_profile_id text)
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
--> statement-breakpoint
-- The public reviewed claims of a public, active profile: statement and decision date only, never evidence.
CREATE FUNCTION trust.public_profile_reviews(p_profile_id text)
RETURNS TABLE (id text, claim_type text, statement text, status text, decided_at timestamptz, revoked_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, trust AS
$$ SELECT r.id, r.claim_type, r.statement, r.status, r.decided_at, r.revoked_at
     FROM trust.identity_reviews r
     JOIN trust.profiles p ON p.tenant_id = r.tenant_id AND p.id = r.profile_id
    WHERE r.profile_id = p_profile_id AND r.kind = 'claim' AND r.visibility = 'public'
      AND r.status IN ('approved', 'revoked')
      AND p.visibility = 'public' AND p.moderation_state = 'active' $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION trust.public_profile(text), trust.public_profile_proofs(text), trust.public_profile_reviews(text)
  FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION trust.public_profile(text), trust.public_profile_proofs(text), trust.public_profile_reviews(text)
  TO originos_app;
