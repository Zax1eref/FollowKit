-- CANDIDATE ONLY: requires actual policy/grant authority (including supautils).
-- Do not apply partially. No login/password/membership is provisioned here.
BEGIN;
-- Supabase can authorize policy DDL through supautils.policy_grants without
-- table ownership. Do not reject that supported path with an ownership-only
-- preflight. Actual GRANT/CREATE POLICY statements enforce permissions; this
-- transaction rolls back all role/grant/policy changes if any statement fails.
CREATE ROLE followkit_deletion_executor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public,followkit_private,auth TO followkit_deletion_executor;
GRANT SELECT(id,email_confirmed_at,is_anonymous) ON auth.users TO followkit_deletion_executor;
GRANT SELECT(id,user_id,not_after) ON auth.sessions TO followkit_deletion_executor;
CREATE POLICY fk_deletion_read_users ON auth.users FOR SELECT TO followkit_deletion_executor USING(true);
CREATE POLICY fk_deletion_read_sessions ON auth.sessions FOR SELECT TO followkit_deletion_executor USING(true);
GRANT SELECT,UPDATE ON followkit_private.deletion_jobs TO followkit_deletion_executor;
GRANT INSERT(subject_id,confirmed_at) ON followkit_private.deletion_jobs TO followkit_deletion_executor;
CREATE POLICY fk_executor_jobs ON followkit_private.deletion_jobs FOR ALL TO followkit_deletion_executor USING(true) WITH CHECK(true);
-- No DELETE/TRUNCATE grant on jobs, tombstones or the ledger.
GRANT SELECT(subject_id) ON followkit_private.account_tombstones TO followkit_deletion_executor;
CREATE POLICY fk_executor_tombstone_read ON followkit_private.account_tombstones FOR SELECT TO followkit_deletion_executor USING(true);
GRANT SELECT ON public.fk_accounts,public.fk_subscriptions TO followkit_deletion_executor;
GRANT UPDATE(state) ON public.fk_accounts TO followkit_deletion_executor;
CREATE POLICY fk_executor_account_update ON public.fk_accounts FOR UPDATE TO followkit_deletion_executor USING(true)
 WITH CHECK(state='deleting' AND EXISTS(SELECT 1 FROM followkit_private.deletion_jobs j WHERE j.subject_id=fk_accounts.id));
-- PostgreSQL row locking requires an UPDATE privilege. Permit locking only;
-- WITH CHECK(false) rejects every actual subscription update.
GRANT UPDATE(status) ON public.fk_subscriptions TO followkit_deletion_executor;
CREATE POLICY fk_executor_subscription_lock ON public.fk_subscriptions FOR UPDATE TO followkit_deletion_executor USING(true) WITH CHECK(false);
GRANT SELECT(account_id) ON public.fk_customers,public.fk_quotes,public.fk_followups,followkit_private.request_dedup TO followkit_deletion_executor;
GRANT DELETE ON public.fk_accounts,public.fk_customers,public.fk_quotes,public.fk_followups,public.fk_subscriptions,followkit_private.request_dedup TO followkit_deletion_executor;
DO $$DECLARE t text; schema_name text; owner_column text;
BEGIN
 FOREACH t IN ARRAY ARRAY['fk_accounts','fk_customers','fk_quotes','fk_followups','fk_subscriptions','request_dedup'] LOOP
  schema_name:=CASE WHEN t='request_dedup' THEN 'followkit_private' ELSE 'public' END;
  owner_column:=CASE WHEN t='fk_accounts' THEN 'id' ELSE 'account_id' END;
  EXECUTE format('CREATE POLICY fk_executor_read ON %I.%I FOR SELECT TO followkit_deletion_executor USING(true)',schema_name,t);
  EXECUTE format('CREATE POLICY fk_executor_delete ON %I.%I FOR DELETE TO followkit_deletion_executor USING(EXISTS(SELECT 1 FROM followkit_private.deletion_jobs j WHERE j.subject_id=%I.%I AND j.completed_at IS NULL AND j.lease_until>clock_timestamp() AND j.archive_verified_at IS NOT NULL AND j.sessions_revoked_at IS NOT NULL AND j.billing_settled_at IS NOT NULL) AND EXISTS(SELECT 1 FROM followkit_private.account_tombstones t WHERE t.subject_id=%I.%I))',schema_name,t,t,owner_column,t,owner_column);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION followkit_private.admit_deletion(uuid,uuid,timestamptz),
 followkit_private.claim_deletion_job(),followkit_private.retry_deletion_job(uuid,uuid,text),
 followkit_private.purge_deletion_app(uuid,uuid),followkit_private.settle_free_deletion_billing(uuid,uuid,uuid),
 followkit_private.complete_deletion_job(uuid,uuid,uuid) TO followkit_deletion_executor;
COMMIT;
