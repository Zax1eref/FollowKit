BEGIN;
-- Explicit opt-in provisioning. Requires provider auth.users.email_confirmed_at/is_anonymous.
-- Tombstones intentionally have no FK to auth.users: deletion must not erase the block.
CREATE TABLE followkit_private.account_tombstones (
 subject_id uuid PRIMARY KEY, blocked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE followkit_private.account_tombstones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON followkit_private.account_tombstones FROM PUBLIC,anon,authenticated;
CREATE INDEX fk_deletion_subject ON followkit_private.deletion_ledger(subject_id);
INSERT INTO followkit_private.account_tombstones(subject_id)
 SELECT subject_id FROM followkit_private.deletion_ledger UNION SELECT id FROM public.fk_accounts WHERE state='deleting';
CREATE FUNCTION followkit_private.record_tombstone() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE subject uuid;
BEGIN
 IF TG_TABLE_NAME='deletion_ledger' THEN subject:=NEW.subject_id;
 ELSIF TG_OP='DELETE' THEN subject:=OLD.id;
 ELSE subject:=NEW.id; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(subject::text,0));
 INSERT INTO followkit_private.account_tombstones(subject_id) VALUES(subject) ON CONFLICT DO NOTHING;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION followkit_private.record_tombstone() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER fk_ledger_tombstone BEFORE INSERT OR UPDATE OF subject_id ON followkit_private.deletion_ledger
 FOR EACH ROW EXECUTE FUNCTION followkit_private.record_tombstone();
CREATE TRIGGER fk_account_delete_tombstone BEFORE DELETE ON public.fk_accounts
 FOR EACH ROW EXECUTE FUNCTION followkit_private.record_tombstone();
CREATE TRIGGER fk_account_state_tombstone BEFORE UPDATE OF state ON public.fk_accounts
 FOR EACH ROW WHEN (NEW.state='deleting') EXECUTE FUNCTION followkit_private.record_tombstone();
CREATE OR REPLACE FUNCTION followkit_private.active_owner() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT a.id FROM public.fk_accounts a WHERE a.id=(SELECT auth.uid()) AND a.state='active'
 AND NOT EXISTS(SELECT 1 FROM followkit_private.account_tombstones t WHERE t.subject_id=a.id)
$$;
CREATE OR REPLACE FUNCTION followkit_private.lock_owner() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid;
BEGIN
 SELECT id INTO owner FROM public.fk_accounts WHERE id=auth.uid() AND state='active' FOR UPDATE;
 IF owner IS NULL OR EXISTS(SELECT 1 FROM followkit_private.account_tombstones WHERE subject_id=owner)
 THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 RETURN owner;
END $$;
CREATE FUNCTION public.fk_onboarding_status() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=auth.uid(); account_state text;
BEGIN
 IF owner IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=owner AND u.email_confirmed_at IS NOT NULL AND u.is_anonymous IS FALSE)
 THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM followkit_private.account_tombstones WHERE subject_id=owner) THEN RETURN jsonb_build_object('status','blocked'); END IF;
 SELECT state INTO account_state FROM public.fk_accounts WHERE id=owner;
 RETURN jsonb_build_object('status',CASE WHEN account_state='active' THEN 'ready' WHEN account_state IS NULL THEN 'setup_required' ELSE 'blocked' END);
END $$;
CREATE FUNCTION public.fk_provision_account(p_confirm boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=auth.uid(); result public.fk_accounts;
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
REVOKE ALL ON FUNCTION public.fk_onboarding_status(),public.fk_provision_account(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fk_onboarding_status(),public.fk_provision_account(boolean) TO authenticated;

COMMIT;
