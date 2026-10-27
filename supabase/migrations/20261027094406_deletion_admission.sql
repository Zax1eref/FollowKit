-- Trusted internal admission only: caller verifies signed AMR and exact confirmation.
CREATE FUNCTION followkit_private.admit_deletion(subject uuid,session uuid,recent_at timestamptz) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result uuid; account_state text;
BEGIN
 IF subject IS NULL OR session IS NULL OR recent_at IS NULL OR recent_at>clock_timestamp()
 OR recent_at<clock_timestamp()-interval '5 minutes'
 THEN RAISE EXCEPTION 'recent_auth_required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM auth.sessions WHERE id=session AND user_id=subject
 AND (not_after IS NULL OR not_after>clock_timestamp());
 IF NOT FOUND THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM auth.users WHERE id=subject AND email_confirmed_at IS NOT NULL AND is_anonymous IS FALSE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(subject::text,0));
 SELECT state INTO account_state FROM public.fk_accounts WHERE id=subject FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'account_unavailable' USING ERRCODE='42501'; END IF;
 SELECT id INTO result FROM followkit_private.deletion_jobs WHERE subject_id=subject;
 IF FOUND THEN RETURN result; END IF;
 IF account_state<>'active' OR EXISTS(SELECT 1 FROM followkit_private.account_tombstones WHERE subject_id=subject)
 THEN RAISE EXCEPTION 'account_unavailable' USING ERRCODE='42501'; END IF;
 -- Recheck freshness after lock waits. All changes commit or roll back together.
 IF NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=session AND user_id=subject AND (not_after IS NULL OR not_after>clock_timestamp())) OR recent_at<clock_timestamp()-interval '5 minutes' THEN RAISE EXCEPTION 'recent_auth_required' USING ERRCODE='42501'; END IF;
 INSERT INTO followkit_private.deletion_jobs(subject_id,confirmed_at) VALUES(subject,clock_timestamp()) RETURNING id INTO result;
 UPDATE public.fk_accounts SET state='deleting' WHERE id=subject;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION followkit_private.admit_deletion(uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
