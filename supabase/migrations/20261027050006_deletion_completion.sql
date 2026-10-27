-- Candidate. Reads provider-owned tables only; never mutates Auth.
ALTER TABLE followkit_private.deletion_jobs ADD COLUMN completed_lease_token uuid;
CREATE FUNCTION followkit_private.complete_deletion_job(job uuid,subject uuid,token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j followkit_private.deletion_jobs;
BEGIN
 SELECT * INTO j FROM followkit_private.deletion_jobs WHERE id=job FOR UPDATE;
 IF NOT FOUND OR subject IS NULL OR j.subject_id IS DISTINCT FROM subject OR token IS NULL
 THEN RAISE EXCEPTION 'deletion_not_ready' USING ERRCODE='42501'; END IF;
 IF j.completed_at IS NULL THEN
  IF j.lease_token IS DISTINCT FROM token OR j.lease_until IS NULL OR j.lease_until<=clock_timestamp()
  THEN RAISE EXCEPTION 'deletion_not_ready' USING ERRCODE='42501'; END IF;
 ELSIF j.completed_lease_token IS DISTINCT FROM token THEN
  RAISE EXCEPTION 'deletion_not_ready' USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(j.subject_id::text,0));
 IF j.archive_verified_at IS NULL OR j.sessions_revoked_at IS NULL OR j.billing_settled_at IS NULL OR j.app_purged_at IS NULL
 OR NOT EXISTS(SELECT 1 FROM followkit_private.account_tombstones WHERE subject_id=j.subject_id)
 OR EXISTS(SELECT 1 FROM auth.users WHERE id=j.subject_id)
 OR EXISTS(SELECT 1 FROM auth.sessions WHERE user_id=j.subject_id)
 OR EXISTS(SELECT 1 FROM public.fk_accounts WHERE id=j.subject_id)
 OR EXISTS(SELECT 1 FROM public.fk_customers WHERE account_id=j.subject_id)
 OR EXISTS(SELECT 1 FROM public.fk_quotes WHERE account_id=j.subject_id)
 OR EXISTS(SELECT 1 FROM public.fk_followups WHERE account_id=j.subject_id)
 OR EXISTS(SELECT 1 FROM public.fk_subscriptions WHERE account_id=j.subject_id)
 OR EXISTS(SELECT 1 FROM followkit_private.request_dedup WHERE account_id=j.subject_id)
 THEN RAISE EXCEPTION 'deletion_not_complete' USING ERRCODE='42501'; END IF;
 IF j.completed_at IS NOT NULL THEN RETURN true; END IF;
 IF j.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'deletion_not_ready' USING ERRCODE='42501'; END IF;
 UPDATE followkit_private.deletion_jobs SET completed_at=clock_timestamp(),completed_lease_token=token,
 lease_token=NULL,lease_until=NULL,last_failure=NULL WHERE id=job;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION followkit_private.complete_deletion_job(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
