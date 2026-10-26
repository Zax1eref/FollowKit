-- Add session revocation checks to all existing owner/read/write entry points.
-- Auth owns session lifecycle. Never grant clients access to auth.sessions.
CREATE FUNCTION followkit_private.session_owner() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=auth.uid(); claim text:=auth.jwt()->>'session_id'; session uuid;
BEGIN
 IF owner IS NULL OR claim IS NULL OR claim !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 session:=claim::uuid;
 IF NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=session AND s.user_id=owner
   AND (s.not_after IS NULL OR s.not_after>statement_timestamp()))
 THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 RETURN owner;
END $$;
REVOKE ALL ON FUNCTION followkit_private.session_owner() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION followkit_private.active_owner() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=followkit_private.session_owner(); result uuid;
BEGIN
 SELECT a.id INTO result FROM public.fk_accounts a WHERE a.id=owner AND a.state='active'
 AND NOT EXISTS(SELECT 1 FROM followkit_private.account_tombstones t WHERE t.subject_id=a.id);
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION followkit_private.lock_owner() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE subject uuid:=followkit_private.session_owner(); owner uuid;
BEGIN
 SELECT id INTO owner FROM public.fk_accounts WHERE id=subject AND state='active' FOR UPDATE;
 IF owner IS NULL OR EXISTS(SELECT 1 FROM followkit_private.account_tombstones WHERE subject_id=owner)
 THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 RETURN owner;
END $$;
CREATE OR REPLACE FUNCTION public.fk_onboarding_status() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=followkit_private.session_owner(); account_state text;
BEGIN
 IF owner IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=owner AND u.email_confirmed_at IS NOT NULL AND u.is_anonymous IS FALSE)
 THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM followkit_private.account_tombstones WHERE subject_id=owner) THEN RETURN jsonb_build_object('status','blocked'); END IF;
 SELECT state INTO account_state FROM public.fk_accounts WHERE id=owner;
 RETURN jsonb_build_object('status',CASE WHEN account_state='active' THEN 'ready' WHEN account_state IS NULL THEN 'setup_required' ELSE 'blocked' END);
END $$;
CREATE OR REPLACE FUNCTION public.fk_provision_account(p_confirm boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=followkit_private.session_owner(); result public.fk_accounts;
BEGIN
 IF p_confirm IS DISTINCT FROM true THEN RAISE EXCEPTION 'confirmation_required'; END IF;
 IF owner IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text,0));
 IF (public.fk_onboarding_status()->>'status')='blocked' THEN RAISE EXCEPTION 'account_blocked'; END IF;
 SELECT * INTO result FROM public.fk_accounts WHERE id=owner;
 IF FOUND THEN RETURN jsonb_build_object('id',result.id,'plan',result.plan); END IF;
 INSERT INTO public.fk_accounts(id,plan,state) VALUES(owner,'free','active') RETURNING * INTO result;
 INSERT INTO public.fk_subscriptions(account_id,status) VALUES(owner,'free');
 RETURN jsonb_build_object('id',result.id,'plan',result.plan);
END $$;

-- CREATE OR REPLACE preserves existing ACLs; reinforce their intended boundaries.
REVOKE ALL ON FUNCTION followkit_private.active_owner(),followkit_private.lock_owner() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION followkit_private.active_owner() TO authenticated;
REVOKE ALL ON FUNCTION public.fk_onboarding_status(),public.fk_provision_account(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fk_onboarding_status(),public.fk_provision_account(boolean) TO authenticated;
