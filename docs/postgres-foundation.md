# PostgreSQL foundation — 25 October 2026 / Asia/Bangkok
Status: SQL candidate implemented and executed on PostgreSQL WASM; not applied to Supabase or a native PostgreSQL server.

## Files and separation
- database/postgres/001-foundation.sql: eight tables, constraints/indexes, owner-read RLS and explicit grants.
- database/postgres/002-mutations.sql: six public RPCs plus private owner-lock/quota helpers.
- tests/postgres/bootstrap.sql: TEST ONLY auth.users/auth.uid/roles simulation. Never apply to Supabase.
- tests/postgres/run.mjs: fresh in-memory PGlite database, actual role switching/RLS checks. Existing SQLite files untouched.
The local app still uses its original SQLite migrations. No online migration or app adapter is enabled by these files. Production migration history is separate; these files have not been applied to a hosted environment.

## Reproduce tests
From the followkit project directory:

```sh
npm ci --prefix tests/postgres --ignore-scripts --no-audit --no-fund
npm test --prefix tests/postgres
npm test
npm run build
```
The optional SQL suite pins @electric-sql/pglite 0.5.11 and includes a lockfile. The main app still has no installed runtime dependency. node_modules is excluded from the source archive.
Observed engine: PostgreSQL 18.6 (PGlite 0.5.11), wasm32. Native postgres/psql/docker were absent; apt installation failed due to sandbox identity/permission constraints. npm package installation succeeded without elevated access. No infrastructure account or cost incurred.

## Authorization design
Application tables: fk_accounts, fk_customers, fk_quotes, fk_followups, fk_subscriptions. Private tables: request_dedup, payment_events, deletion_ledger. All eight enable RLS.
Authenticated users have SELECT-only table grants. SELECT policies require owner=auth.uid() and an active account. Anonymous role has neither reads nor mutation RPC grants. No direct client INSERT/UPDATE/DELETE or plan/state escalation is allowed.
Only fk_save_customer, fk_delete_customer, fk_create_quote, fk_update_quote, fk_delete_quote and fk_followup are callable mutation functions. They derive the owner from auth.uid(), require an active account, and acquire its row lock before mutations. Private functions and tables are not directly usable by clients except the narrow active-owner predicate needed by RLS.
Functions run as migration owner, with empty pinned search_path and fully qualified application tables/helpers. Deploy through a trusted migration owner with the expected RLS bypass permissions; verify the actual owner/grants in staging. No function accepts an authoritative account_id. Client customer/quote IDs always receive owner checks; composite foreign keys also prevent cross-tenant relationships.
Quote draft creation is atomic with customer creation and durable dedup. The owner row lock is designed to serialize quota/reopen/retry operations. Free cap 10 and paid cap 500 mirror the current product hypothesis. Closed quotes do not consume pending quota. A failed insert leaves no orphan customer or dedup response. Retrying an old successful key returns its historical response, even if the quote was later deleted; retention semantics remain to be decided.
Followups store structured fields rather than the local JSON-encoded note. A retry key is scoped to owner/quote; a changed payload conflicts. Event insert and next-due update share a transaction.

## Verification evidence
14/14 SQL test groups passed; full output project/postgres-test-results.txt. Tests use non-superuser/non-bypassrls roles, not admin reads disguised as RLS tests.
Covered: eight-table RLS, A/B isolation and owner-derived creation, anonymous and missing subject, private/helper/direct-write denial, foreign-ID CRUD rejection, dedup replay/conflict, invalid amount/date/infinite-date rollback, followup replay/conflict/rollback, sequential quota and reopen checks, customer/quote deletion links, composite FK, deleting-account denial, pinned search_path/anonymous execute denial.
Existing local suite: 54/54 passed; build passed. These are separate counts, not 68 identical test cases.

## Remaining release gates
PGlite runs one connection; simultaneous transaction/quota/lock behavior has NOT been proven. Run native PostgreSQL/Supabase tests with concurrent connections before enabling production writes. Supabase auth.uid() was simulated from a test setting; no JWT verification, email confirmation, password reset, session revocation or PostgREST behavior was tested.
Account provisioning, full account purge/deletion orchestration, ledger restore reconciliation, live-session enforcement, production export/pagination adapter, remote backup and production default-grant verification remain incomplete. The ledger table alone does not implement deletion recovery. A deleting-account state blocks reads/RPCs, but refresh-token revocation is separate.
Next implementation: async repository interface and user-token HTTP adapter; then native multi-connection SQL and provider-auth integration tests. Never deploy the SQLite test harness as the production Worker.

Sources consulted 25 October 2026:
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/functions
- https://github.com/electric-sql/pglite (WASM/single-connection limitations)
