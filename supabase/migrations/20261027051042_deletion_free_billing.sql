-- Only for a deployment with NO payment provider ever enabled. Not cancellation.
ALTER TABLE followkit_private.deletion_jobs ADD COLUMN billing_basis text CHECK(billing_basis='free_no_provider');
CREATE FUNCTION followkit_private.settle_free_deletion_billing(job uuid,subject uuid,token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j followkit_private.deletion_jobs; a public.fk_accounts; s public.fk_subscriptions;
BEGIN
 SELECT * INTO j FROM followkit_private.deletion_jobs WHERE id=job FOR UPDATE;
 IF NOT FOUND OR subject IS NULL OR j.subject_id IS DISTINCT FROM subject OR token IS NULL
 OR j.lease_token IS DISTINCT FROM token OR j.lease_until IS NULL OR j.lease_until<=clock_timestamp()
 OR j.completed_at IS NOT NULL OR j.archive_verified_at IS NULL OR j.sessions_revoked_at IS NULL
 THEN RAISE EXCEPTION 'billing_not_ready' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(j.subject_id::text,0));
 IF NOT EXISTS(SELECT 1 FROM followkit_private.account_tombstones WHERE subject_id=j.subject_id)
 THEN RAISE EXCEPTION 'billing_not_ready' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.fk_accounts WHERE id=j.subject_id FOR UPDATE;
 IF NOT FOUND THEN
  IF j.billing_basis='free_no_provider' AND j.billing_settled_at IS NOT NULL AND j.app_purged_at IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM public.fk_subscriptions WHERE account_id=j.subject_id)
  AND j.lease_until>clock_timestamp() THEN RETURN true; END IF;
  RAISE EXCEPTION 'billing_review_required' USING ERRCODE='42501';
 END IF;
 IF a.plan<>'free' OR a.state<>'deleting' THEN RAISE EXCEPTION 'billing_review_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.fk_subscriptions WHERE account_id=j.subject_id FOR UPDATE;
 IF NOT FOUND OR s.status<>'free' OR s.provider_customer_id IS NOT NULL OR s.current_period_end IS NOT NULL
 THEN RAISE EXCEPTION 'billing_review_required' USING ERRCODE='42501'; END IF;
 IF j.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'billing_not_ready' USING ERRCODE='42501'; END IF;
 UPDATE followkit_private.deletion_jobs SET billing_settled_at=coalesce(billing_settled_at,clock_timestamp()),billing_basis='free_no_provider' WHERE id=job;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION followkit_private.settle_free_deletion_billing(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
