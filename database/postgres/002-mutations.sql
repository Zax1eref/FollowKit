-- Privileged functions are narrowly scoped, own-derived, with pinned search_path.
-- All mutations lock the same owner row: serializes quota, retry and deletion state.
CREATE FUNCTION followkit_private.lock_owner() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid;
BEGIN
 SELECT id INTO owner FROM public.fk_accounts WHERE id=auth.uid() AND state='active' FOR UPDATE;
 IF owner IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 RETURN owner;
END $$;
CREATE FUNCTION followkit_private.check_quota(owner uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE max_jobs integer;
BEGIN
 SELECT CASE plan WHEN 'free' THEN 10 WHEN 'paid' THEN 500 END INTO max_jobs FROM public.fk_accounts WHERE id=owner;
 IF max_jobs IS NULL OR (SELECT count(*) FROM public.fk_quotes WHERE account_id=owner AND status='pending')>=max_jobs THEN
 RAISE EXCEPTION 'plan_limit' USING ERRCODE='P0001'; END IF;
END $$;
CREATE FUNCTION public.fk_save_customer(p_name text,p_contact text DEFAULT '',p_id uuid DEFAULT NULL)
RETURNS public.fk_customers LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=followkit_private.lock_owner(); result public.fk_customers;
BEGIN
 IF p_id IS NULL THEN INSERT INTO public.fk_customers(account_id,name,contact) VALUES(owner,btrim(p_name),p_contact) RETURNING * INTO result;
 ELSE UPDATE public.fk_customers SET name=btrim(p_name),contact=p_contact WHERE id=p_id AND account_id=owner RETURNING * INTO result;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF; END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.fk_delete_customer(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=followkit_private.lock_owner();
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.fk_customers WHERE id=p_id AND account_id=owner) THEN RAISE EXCEPTION 'not_found'; END IF;
 IF EXISTS(SELECT 1 FROM public.fk_quotes WHERE customer_id=p_id AND account_id=owner) THEN RAISE EXCEPTION 'customer_has_quotes'; END IF;
 DELETE FROM public.fk_customers WHERE id=p_id AND account_id=owner;
END $$;
CREATE FUNCTION public.fk_create_quote(p_key text,p_title text,p_amount bigint,p_sent date,p_due date,
 p_customer_id uuid DEFAULT NULL,p_customer_name text DEFAULT NULL,p_status text DEFAULT 'pending')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=followkit_private.lock_owner(); customer uuid; result public.fk_quotes; prior followkit_private.request_dedup; payload jsonb;
BEGIN
 IF p_key IS NULL OR p_key !~ '^[-a-zA-Z0-9_]{16,128}$' THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
 IF (p_customer_id IS NULL)=(p_customer_name IS NULL) THEN RAISE EXCEPTION 'choose_customer'; END IF;
 payload:=jsonb_build_object('title',p_title,'amount',p_amount,'sent',p_sent,'due',p_due,'customer_id',p_customer_id,'customer_name',p_customer_name,'status',p_status);
 SELECT * INTO prior FROM followkit_private.request_dedup WHERE account_id=owner AND scope='quote-draft' AND request_key=p_key;
 IF FOUND THEN
  IF prior.payload<>payload THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
  RETURN prior.response||jsonb_build_object('replayed',true);
 END IF;
 IF p_status='pending' THEN PERFORM followkit_private.check_quota(owner); END IF;
 IF p_customer_id IS NULL THEN
  INSERT INTO public.fk_customers(account_id,name) VALUES(owner,btrim(p_customer_name)) RETURNING id INTO customer;
 ELSE
  SELECT id INTO customer FROM public.fk_customers WHERE id=p_customer_id AND account_id=owner;
  IF customer IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 END IF;
 INSERT INTO public.fk_quotes(account_id,customer_id,title,amount_satang,sent_on,due_on,status)
 VALUES(owner,customer,btrim(p_title),p_amount,p_sent,p_due,p_status) RETURNING * INTO result;
 INSERT INTO followkit_private.request_dedup(account_id,scope,request_key,payload,response)
 VALUES(owner,'quote-draft',p_key,payload,to_jsonb(result));
 RETURN to_jsonb(result)||jsonb_build_object('replayed',false);
END $$;
CREATE FUNCTION public.fk_update_quote(p_id uuid,p_title text,p_amount bigint,p_sent date,p_due date,p_status text)
RETURNS public.fk_quotes LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=followkit_private.lock_owner(); result public.fk_quotes;
BEGIN
 SELECT * INTO result FROM public.fk_quotes WHERE id=p_id AND account_id=owner;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
 IF p_status='pending' AND result.status<>'pending' THEN PERFORM followkit_private.check_quota(owner); END IF;
 UPDATE public.fk_quotes SET title=btrim(p_title),amount_satang=p_amount,sent_on=p_sent,due_on=p_due,status=p_status
 WHERE id=p_id AND account_id=owner RETURNING * INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.fk_delete_quote(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=followkit_private.lock_owner();
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.fk_quotes WHERE id=p_id AND account_id=owner) THEN RAISE EXCEPTION 'not_found'; END IF;
 DELETE FROM public.fk_followups WHERE quote_id=p_id AND account_id=owner;
 DELETE FROM public.fk_quotes WHERE id=p_id AND account_id=owner;
END $$;
CREATE FUNCTION public.fk_followup(p_quote_id uuid,p_key text,p_note text,p_next_due date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=followkit_private.lock_owner(); q public.fk_quotes; previous public.fk_followups; result public.fk_followups;
BEGIN
 SELECT * INTO q FROM public.fk_quotes WHERE id=p_quote_id AND account_id=owner;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
 IF p_next_due IS NULL OR p_next_due<q.sent_on THEN RAISE EXCEPTION 'invalid_date'; END IF;
 SELECT * INTO previous FROM public.fk_followups WHERE account_id=owner AND quote_id=p_quote_id AND request_key=p_key;
 IF FOUND THEN
  IF previous.note IS DISTINCT FROM btrim(p_note) OR previous.next_due IS DISTINCT FROM p_next_due THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
  RETURN to_jsonb(previous)||jsonb_build_object('replayed',true);
 END IF;
 IF q.status<>'pending' THEN RAISE EXCEPTION 'quote_closed'; END IF;
 INSERT INTO public.fk_followups(account_id,quote_id,note,next_due,request_key) VALUES(owner,p_quote_id,btrim(p_note),p_next_due,p_key) RETURNING * INTO result;
 UPDATE public.fk_quotes SET due_on=p_next_due WHERE id=p_quote_id AND account_id=owner;
 RETURN to_jsonb(result)||jsonb_build_object('replayed',false);
END $$;
REVOKE ALL ON FUNCTION followkit_private.lock_owner(),followkit_private.check_quota(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fk_save_customer(text,text,uuid),public.fk_delete_customer(uuid),
 public.fk_create_quote(text,text,bigint,date,date,uuid,text,text),public.fk_update_quote(uuid,text,bigint,date,date,text),
 public.fk_delete_quote(uuid),public.fk_followup(uuid,text,text,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fk_save_customer(text,text,uuid),public.fk_delete_customer(uuid),
 public.fk_create_quote(text,text,bigint,date,date,uuid,text,text),public.fk_update_quote(uuid,text,bigint,date,date,text),
 public.fk_delete_quote(uuid),public.fk_followup(uuid,text,text,date) TO authenticated;
