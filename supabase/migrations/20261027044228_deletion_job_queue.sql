-- Internal persistence only. No admission API, worker grants or destructive actions.
CREATE TABLE followkit_private.deletion_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 subject_id uuid NOT NULL UNIQUE,
 confirmed_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 lease_token uuid,
 lease_until timestamptz,
 last_failure text CHECK(last_failure IN ('archive','blockAccess','revokeSessions','settleBilling','removeIdentity','purgeData','complete','load_confirmed')),
 completed_at timestamptz,
 CHECK ((lease_token IS NULL) = (lease_until IS NULL)),
 CHECK (completed_at IS NULL OR lease_token IS NULL)
);
ALTER TABLE followkit_private.deletion_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON followkit_private.deletion_jobs FROM PUBLIC,anon,authenticated;
CREATE INDEX fk_deletion_jobs_pending ON followkit_private.deletion_jobs(next_attempt_at,id) WHERE completed_at IS NULL;
-- Owner and confirmation cannot be retargeted by a resumed task.
CREATE FUNCTION followkit_private.protect_deletion_job() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
 OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at OR NEW.created_at IS DISTINCT FROM OLD.created_at
 OR (OLD.completed_at IS NOT NULL AND NEW IS DISTINCT FROM OLD)
 THEN RAISE EXCEPTION 'immutable_deletion_job' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION followkit_private.protect_deletion_job() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER fk_deletion_job_identity BEFORE UPDATE ON followkit_private.deletion_jobs
FOR EACH ROW EXECUTE FUNCTION followkit_private.protect_deletion_job();
-- Claim one due job. Row locking prevents two claimers receiving the same live lease.
CREATE FUNCTION followkit_private.claim_deletion_job() RETURNS SETOF followkit_private.deletion_jobs
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 WITH candidate AS (
 SELECT id FROM followkit_private.deletion_jobs
 WHERE completed_at IS NULL AND next_attempt_at<=statement_timestamp()
 AND (lease_until IS NULL OR lease_until<=statement_timestamp())
 ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1
 )
 UPDATE followkit_private.deletion_jobs j SET lease_token=gen_random_uuid(),
 lease_until=statement_timestamp()+interval '5 minutes',attempts=j.attempts+1
 FROM candidate c WHERE j.id=c.id RETURNING j.*
$$;
REVOKE ALL ON FUNCTION followkit_private.claim_deletion_job() FROM PUBLIC,anon,authenticated;
-- Release only the current unexpired lease; stale workers cannot reschedule a replacement.
CREATE FUNCTION followkit_private.retry_deletion_job(job uuid,token uuid,failure text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF failure IS NULL OR failure NOT IN ('archive','blockAccess','revokeSessions','settleBilling','removeIdentity','purgeData','complete','load_confirmed') THEN
 RAISE EXCEPTION 'invalid_failure_stage' USING ERRCODE='22023'; END IF;
 UPDATE followkit_private.deletion_jobs SET lease_token=NULL,lease_until=NULL,
 next_attempt_at=statement_timestamp()+interval '1 minute',last_failure=failure
 WHERE id=job AND lease_token=token AND lease_until>statement_timestamp() AND completed_at IS NULL;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION followkit_private.retry_deletion_job(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
