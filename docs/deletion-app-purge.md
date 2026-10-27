# Transactional app purge — 27 October 2026

Candidate only, not applied to hosted Supabase or wired to a running worker. Created with Supabase CLI migration new. Requires the candidate deletion_job_queue migration. Do not run db push against the historical mixed migration layout.

purge_deletion_app(job,token) is a private SECURITY INVOKER function with empty search_path and no PUBLIC/anon/authenticated execution grant. It derives the subject from a locked durable job, checks unfinished state and current unexpired lease, and requires trusted-adapter archive_verified_at, sessions_revoked_at and billing_settled_at evidence. The function does not itself contact R2, Auth or billing; these timestamps are internal attestations, not cryptographic proof. No evidence-writing API or client grant is introduced.

It takes the provisioning advisory lock and account row lock, requires a retained tombstone and a deleting account if the account exists, checks wall-clock lease expiry after lock waits, and deletes owner-scoped followups, quotes, customers, request_dedup, subscriptions and account in FK-safe order. An expiry at the end also aborts the statement. A single function invocation is transactional; the job row lock fences concurrent replacement claims until transaction end. Callers must use bounded transactions/timeouts and commit promptly; no database function can enforce elapsed time after it returns but before an outer transaction commits.

Only app_purged_at is recorded; completed_at remains unset. Auth users, deletion jobs, tombstones, deletion ledger and global payment events remain. Retrying with the current valid lease after successful purge is safe and does not require an account row. This is logical deletion, not physical byte erasure or deletion from backups. Unknown future account-linked tables must be incorporated before deployment; non-cascading FK failures will roll back the purge.

Verification: node tests/postgres/deletion-purge.mjs, actual PostgreSQL WASM with synthetic owner A/B. Three groups cover missing evidence, active-account rejection, client denial, wrong/expired lease; injected failure after earlier deletes rolling back all changes; all six app tables cleared with repeat-call safety while B remains byte-for-byte equal and Auth/job/tombstone/ledger/global events survive. Provider evidence is simulated; no remote R2/Auth/billing calls are made.

Pending before activation: native multi-connection tests on PostgreSQL 17/18, hosted advisors, trusted adapter/least-privilege role wiring, supported Auth revocation/removal, billing reconciliation, admission/recent authentication, lease renewal, and final completion verification. No real account has been deleted and no user deployment is required for this candidate.


## Native concurrency evidence

GitHub Actions run [40451868254](https://github.com/Zax1eref/FollowKit/actions/runs/40451868254) passed all nine native groups three times each on PostgreSQL 17 and 18, with fresh disposable databases. Added groups verify only one concurrent claimer receives the active job, a replacement lease rejects the old purge token without deleting quotes, and an uncommitted purge rolls back before successful cross-connection retry. Other-owner records and retained tombstones remain, and completion remains pending. Existing session-revocation, guard and independent restore drills also passed. This closes the stated native test gate for these cases; live provider adapters, hosted advisors and deployment remain pending. Provider identity/evidence is simulated in CI.
