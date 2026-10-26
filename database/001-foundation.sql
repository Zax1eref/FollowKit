-- Local relational prototype only. Not an authentication or authorization boundary.
PRAGMA foreign_keys=ON;
CREATE TABLE accounts(id TEXT PRIMARY KEY, plan TEXT NOT NULL DEFAULT 'free' CHECK(plan IN('free','paid')));
CREATE TABLE customers(id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100), contact TEXT, UNIQUE(id,account_id));
CREATE TABLE quotes(id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), customer_id TEXT NOT NULL, title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160), amount_satang INTEGER NOT NULL CHECK(amount_satang>=0), sent_on TEXT NOT NULL, due_on TEXT NOT NULL CHECK(due_on>=sent_on), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','won','lost')), UNIQUE(id,account_id), FOREIGN KEY(customer_id,account_id) REFERENCES customers(id,account_id));
CREATE INDEX quotes_due ON quotes(account_id,status,due_on);
CREATE TABLE followup_events(id TEXT PRIMARY KEY, account_id TEXT NOT NULL, quote_id TEXT NOT NULL, performed_at TEXT NOT NULL, note TEXT, FOREIGN KEY(quote_id,account_id) REFERENCES quotes(id,account_id));
CREATE TABLE subscriptions(account_id TEXT PRIMARY KEY REFERENCES accounts(id), status TEXT NOT NULL DEFAULT 'free' CHECK(status IN('free','trialing','active','past_due','canceled','expired')), current_period_end TEXT, provider_customer_id TEXT);
CREATE TABLE payment_events(provider TEXT NOT NULL, event_id TEXT NOT NULL, processed_at TEXT NOT NULL, PRIMARY KEY(provider,event_id));
