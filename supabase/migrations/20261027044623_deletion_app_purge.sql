-- Candidate only. Evidence is written by trusted adapters, never browser clients.
ALTER TABLE followkit_private.deletion_jobs
 ADD COLUMN archive_verified_at timestamptz,
 ADD COLUMN sessions_revoked_at timestamptz,
 ADD COLUMN billing_settled_at timestamptz,
 ADD COLUMN app_purged_at timestamptz;
CREATE FUNCTION followkit_private.purge_deletion_app(job uuid,token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j followkit_private.deletion_jobs; account_state text;
BEGIN
 SELECT * INTO j FROM followkit_private.deletion_jobs WHERE id=job FOR UPDATE;
 IF NOT FOUND OR j.completed_at IS NOT NULL OR token IS NULL OR j.lease_token IS DISTINCT FROM token
 OR j.lease_until IS NULL OR j.lease_until<=clock_timestamp()
 OR j.archive_verified_at IS NULL OR j.sessions_revoked_at IS NULL OR j.billing_settled_at IS NULL
 THEN RAISE EXCEPTION 'deletion_not_ready' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(j.subject_id::text,0));
 SELECT state INTO account_state FROM public.fk_accounts WHERE id=j.subject_id FOR UPDATE;
 IF (FOUND AND account_state<>'deleting') OR NOT EXISTS(
 SELECT 1 FROM followkit_private.account_tombstones WHERE subject_id=j.subject_id)
 THEN RAISE EXCEPTION 'deletion_not_blocked' USING ERRCODE='42501'; END IF;
 -- Recheck wall-clock expiry after waiting for locks; failures roll back all deletes.
 IF j.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'deletion_lease_expired' USING ERRCODE='42501'; END IF;
 DELETE FROM public.fk_followups WHERE account_id=j.subject_id;
 DELETE FROM public.fk_quotes WHERE account_id=j.subject_id;
 DELETE FROM public.fk_customers WHERE account_id=j.subject_id;
 DELETE FROM followkit_private.request_dedup WHERE account_id=j.subject_id;
 DELETE FROM public.fk_subscriptions WHERE account_id=j.subject_id;
 DELETE FROM public.fk_accounts WHERE id=j.subject_id;
 IF j.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'deletion_lease_expired' USING ERRCODE='42501'; END IF;
 UPDATE followkit_private.deletion_jobs SET app_purged_at=coalesce(app_purged_at,clock_timestamp()) WHERE id=job;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION followkit_private.purge_deletion_app(uuid,uuid) FROM PUBLIC,anon,authenticated;
