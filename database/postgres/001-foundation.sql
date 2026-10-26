-- Supabase PostgreSQL candidate. Apply to a clean test project first.
-- Requires provider-managed auth.users/auth.uid() and anon/authenticated roles.
-- Never apply to the SQLite harness. Account provisioning is intentionally absent.
CREATE SCHEMA followkit_private;
REVOKE ALL ON SCHEMA followkit_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA followkit_private TO authenticated;
CREATE TABLE public.fk_accounts (
 id uuid PRIMARY KEY REFERENCES auth.users(id),
 plan text NOT NULL DEFAULT 'free' CHECK(plan IN ('free','paid')),
 state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','deleting'))
);
CREATE TABLE public.fk_customers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES public.fk_accounts(id),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 100),
 contact text NOT NULL DEFAULT '' CHECK(length(contact)<=250), UNIQUE(id,account_id)
);
CREATE TABLE public.fk_quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES public.fk_accounts(id),
 customer_id uuid NOT NULL, title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 160),
 amount_satang bigint NOT NULL CHECK(amount_satang BETWEEN 0 AND 10000000000),
 sent_on date NOT NULL CHECK(sent_on BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
 due_on date NOT NULL CHECK(due_on>=sent_on AND due_on BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','won','lost')),
 UNIQUE(id,account_id), FOREIGN KEY(customer_id,account_id) REFERENCES public.fk_customers(id,account_id)
);
CREATE TABLE public.fk_followups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES public.fk_accounts(id),
 quote_id uuid NOT NULL, performed_at timestamptz NOT NULL DEFAULT now(),
 note text NOT NULL CHECK(length(btrim(note)) BETWEEN 1 AND 2000), next_due date NOT NULL CHECK(next_due BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
 request_key text NOT NULL CHECK(length(request_key) BETWEEN 1 AND 100),
 UNIQUE(account_id,quote_id,request_key), FOREIGN KEY(quote_id,account_id) REFERENCES public.fk_quotes(id,account_id)
);
CREATE TABLE public.fk_subscriptions (
 account_id uuid PRIMARY KEY REFERENCES public.fk_accounts(id),
 status text NOT NULL DEFAULT 'free' CHECK(status IN ('free','trialing','active','past_due','canceled','expired')),
 current_period_end timestamptz, provider_customer_id text
);
CREATE TABLE followkit_private.request_dedup (
 account_id uuid NOT NULL REFERENCES public.fk_accounts(id), scope text NOT NULL,
 request_key text NOT NULL, payload jsonb NOT NULL, response jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(account_id,scope,request_key)
);
CREATE TABLE followkit_private.payment_events (
 provider text NOT NULL,event_id text NOT NULL,processed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(provider,event_id)
);
CREATE TABLE followkit_private.deletion_ledger (
 request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subject_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('requested','blocked','purged','complete')),
 requested_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE INDEX fk_customers_owner ON public.fk_customers(account_id,id);
CREATE INDEX fk_quotes_owner_due ON public.fk_quotes(account_id,status,due_on,id);
CREATE INDEX fk_quotes_customer ON public.fk_quotes(account_id,customer_id);
CREATE INDEX fk_followups_owner ON public.fk_followups(account_id,quote_id,performed_at,id);
-- Pin search_path; no dynamic SQL. This helper avoids recursive account RLS.
CREATE FUNCTION followkit_private.active_owner() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT a.id FROM public.fk_accounts a WHERE a.id=(SELECT auth.uid()) AND a.state='active'
$$;
REVOKE ALL ON FUNCTION followkit_private.active_owner() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION followkit_private.active_owner() TO authenticated;
ALTER TABLE public.fk_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fk_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fk_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fk_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fk_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE followkit_private.request_dedup ENABLE ROW LEVEL SECURITY;
ALTER TABLE followkit_private.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE followkit_private.deletion_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_active_account ON public.fk_accounts FOR SELECT TO authenticated USING(id=(SELECT followkit_private.active_owner()));
CREATE POLICY own_active_customers ON public.fk_customers FOR SELECT TO authenticated USING(account_id=(SELECT followkit_private.active_owner()));
CREATE POLICY own_active_quotes ON public.fk_quotes FOR SELECT TO authenticated USING(account_id=(SELECT followkit_private.active_owner()));
CREATE POLICY own_active_followups ON public.fk_followups FOR SELECT TO authenticated USING(account_id=(SELECT followkit_private.active_owner()));
CREATE POLICY own_active_subscriptions ON public.fk_subscriptions FOR SELECT TO authenticated USING(account_id=(SELECT followkit_private.active_owner()));
REVOKE ALL ON public.fk_accounts,public.fk_customers,public.fk_quotes,public.fk_followups,public.fk_subscriptions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.fk_accounts,public.fk_customers,public.fk_quotes,public.fk_followups,public.fk_subscriptions TO authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA followkit_private FROM PUBLIC,anon,authenticated;
-- No client INSERT/UPDATE/DELETE, including plan/state changes. RPC-only mutations.
