CREATE TABLE IF NOT EXISTS request_dedup (
 account_id TEXT NOT NULL REFERENCES accounts(id),
 scope TEXT NOT NULL,
 request_key TEXT NOT NULL,
 payload TEXT NOT NULL,
 response TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(account_id,scope,request_key)
);
