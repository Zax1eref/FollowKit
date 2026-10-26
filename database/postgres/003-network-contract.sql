-- Additive HTTP repository contract; earlier migrations unchanged.
CREATE FUNCTION public.fk_create_quote_scoped(p_scope text,p_key text,p_title text,p_amount bigint,p_sent date,p_due date,
 p_customer_id uuid DEFAULT NULL,p_customer_name text DEFAULT NULL,p_status text DEFAULT 'pending')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=followkit_private.lock_owner(); customer uuid; result public.fk_quotes; prior followkit_private.request_dedup; payload jsonb;
BEGIN
 IF p_scope NOT IN ('quote','quote-draft') OR p_scope IS NULL THEN RAISE EXCEPTION 'invalid_fields'; END IF;
 IF p_key IS NULL OR p_key !~ '^[-a-zA-Z0-9_]{16,128}$' THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
 IF (p_customer_id IS NULL)=(p_customer_name IS NULL) THEN RAISE EXCEPTION 'choose_customer'; END IF;
 payload:=jsonb_build_object('title',p_title,'amount',p_amount,'sent',p_sent,'due',p_due,'customer_id',p_customer_id,'customer_name',p_customer_name,'status',p_status);
 SELECT * INTO prior FROM followkit_private.request_dedup WHERE account_id=owner AND scope=p_scope AND request_key=p_key;
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
 VALUES(owner,p_scope,p_key,payload,to_jsonb(result));
 RETURN to_jsonb(result)||jsonb_build_object('replayed',false);
END $$;
CREATE FUNCTION public.fk_patch_quote(p_id uuid,p_patch jsonb) RETURNS public.fk_quotes
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=followkit_private.lock_owner(); old public.fk_quotes; merged public.fk_quotes;
BEGIN
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' THEN RAISE EXCEPTION 'invalid_fields'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN ('customer_id','title','amount_satang','sent_on','due_on','status')) THEN RAISE EXCEPTION 'invalid_fields'; END IF;
 SELECT * INTO old FROM public.fk_quotes WHERE id=p_id AND account_id=owner;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
 SELECT * INTO merged FROM jsonb_populate_record(old,p_patch);
 IF NOT EXISTS(SELECT 1 FROM public.fk_customers WHERE id=merged.customer_id AND account_id=owner) THEN RAISE EXCEPTION 'not_found'; END IF;
 IF merged.status='pending' AND old.status<>'pending' THEN PERFORM followkit_private.check_quota(owner); END IF;
 UPDATE public.fk_quotes SET customer_id=merged.customer_id,title=btrim(merged.title),amount_satang=merged.amount_satang,
 sent_on=merged.sent_on,due_on=merged.due_on,status=merged.status WHERE id=p_id AND account_id=owner RETURNING * INTO merged;
 RETURN merged;
END $$;
-- Invoker rights preserve RLS. Reject inactive/missing owner instead of empty-success.
CREATE FUNCTION public.fk_dashboard(p_today date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF followkit_private.active_owner() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('customers',(SELECT count(*) FROM public.fk_customers),
 'pending',(SELECT count(*) FROM public.fk_quotes WHERE status='pending'),
 'due',(SELECT count(*) FROM public.fk_quotes WHERE status='pending' AND due_on<=p_today),
 'amount_satang',(SELECT coalesce(sum(amount_satang),0) FROM public.fk_quotes WHERE status='pending'),'today',p_today);
END $$;
CREATE FUNCTION public.fk_followups_json(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF followkit_private.active_owner() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.fk_quotes WHERE id=p_id) THEN RAISE EXCEPTION 'not_found'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY performed_at,id) FROM public.fk_followups f WHERE quote_id=p_id),'[]'::jsonb);
END $$;
CREATE FUNCTION public.fk_export_account() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF followkit_private.active_owner() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('format','followkit-account-export','version',1,'exported_at',now(),
 'account',(SELECT jsonb_build_object('id',id,'plan',plan) FROM public.fk_accounts),
 'customers',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.fk_customers c),'[]'::jsonb),
 'quotes',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY id) FROM public.fk_quotes q),'[]'::jsonb),
 'followups',coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY performed_at,id) FROM public.fk_followups f),'[]'::jsonb),
 'subscriptions',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY account_id) FROM public.fk_subscriptions s),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.fk_create_quote_scoped(text,text,text,bigint,date,date,uuid,text,text),public.fk_patch_quote(uuid,jsonb),
 public.fk_dashboard(date),public.fk_followups_json(uuid),public.fk_export_account() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fk_create_quote_scoped(text,text,text,bigint,date,date,uuid,text,text),public.fk_patch_quote(uuid,jsonb),
 public.fk_dashboard(date),public.fk_followups_json(uuid),public.fk_export_account() TO authenticated;
