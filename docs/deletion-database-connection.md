# Dedicated deletion database connection — 29 October 2026

Prepared code only; no runtime login, password, Worker deployment or live transport test has been performed. Existing deletion capability role is installed. Public deletion remains disabled.

`src/server/deletion-database.mjs` accepts an injected node-postgres Client and a server secret connection URL. Each call opens a fresh TLS-verified connection, validates current_user/session_user are followkit_deletion_runtime with inherited executor capability and no superuser/bypass/create-role/create-db/replication flags, runs one parameterized statement and closes. Direct project host or Supabase shared session pool on port 5432 only; transaction pool 6543, admin usernames, URL query options and unrelated hosts are rejected. Optional CA must be the trusted certificate obtained from the project dashboard. Never disable certificate validation.

Connection timeout is 2 seconds, query timeout 2.5 seconds, server statement timeout 2 seconds and lock timeout 1 second. A 7-second overall deadline bounds setup/identity/query, followed by at most 0.5 seconds of cleanup. No connection is reused. A response lost after commit remains an uncertain outcome; the adapter never retries SQL automatically. Existing workflow reconciliation handles that condition. Server timeout propagation through the selected pooler still needs live verification. This adapter is trusted internal code, not a public arbitrary-SQL interface.

`tools/deletion/database-probe.mjs` is a separate private Worker entrypoint exposing only verify() through a service binding. It has no public HTTP route, no scheduler, no confirmation or deletion methods, no archive binding and no Auth admin secret. It checks role/privilege metadata and that the job queue is empty; output contains no rows, IDs, credentials or provider error text. An empty queue is a commissioning check, not a general health requirement once deletion is running. Driver pg is pinned at 8.23.1 with a lockfile. Configuration: wrangler.deletion-database-probe.jsonc.

## Remaining operator setup

1. Provision the separate `followkit_deletion_runtime` login through a secure local administrator session. It needs NO SUPERUSER/BYPASSRLS/CREATEROLE/CREATEDB/REPLICATION, only inherited followkit_deletion_executor membership, and no unrelated grants. Do not add membership to anon/authenticated/authenticator. Do not paste passwords into ChatGPT or commit them. This document does not provision that login or supply credentials.
2. Use a dedicated randomly generated password stored in the operator's password manager. Build the URL using the exact Supabase dashboard Direct or Session pooler host, database postgres, port 5432, and the dedicated login (pooler username includes `.kfnputowvfxozdiuhpzo`). Percent-encode the password in the URL. Do not use the postgres connection URL.
3. After the login has been verified, run from the repository on the operator's machine:

```powershell
npm ci --prefix tools/deletion
npx --yes wrangler@4.152.0 deploy --config wrangler.deletion-database-probe.jsonc
npx --yes wrangler@4.152.0 secret put DELETION_DATABASE_URL --config wrangler.deletion-database-probe.jsonc
```

The secret command prompts privately; paste the dedicated connection URL there, never in this chat. If a project CA is required, install it as DELETION_DATABASE_CA using the provider certificate; do not relax TLS. Deploying before secrets leaves verify() returning passed:false.

A private service-binding caller for the probe and live acceptance are still required; this document does not claim a remote probe passed. The production deletion Worker composition, Auth-admin secret, billing-mode confirmation, rate-limit binding and public feature enablement are also pending. Keep the main Worker configuration unchanged.

## Validation

Six focused adapter tests cover parameter forwarding/fresh connections, forbidden role identities, unsafe URL variants, pooler username scoping, sanitized query failures without retries and a stalled connection deadline. Mock tests verify adapter decisions, not real TLS, Supavisor or hosted SQL execution.

References reviewed:
- https://node-postgres.com/apis/client
- https://node-postgres.com/features/ssl
- https://developers.cloudflare.com/workers/tutorials/postgres/
- https://supabase.com/docs/guides/database/connecting-to-postgres

Validation completed: npm test 181/181; Wrangler 4.152.0 deploy --dry-run built a 201.39 KiB module (41.90 KiB gzip); Miniflare loaded that exact bundle and confirmed GET/POST/DELETE return 404 while missing-secret private RPC returns a sanitized passed:false result without network access. Reproduce the bundle test with `node tools/worker/deletion-database-probe-test.mjs <dry-run-output>/database-probe.js`. No Cloudflare upload or live database connection was performed.
