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

The private service-binding caller is now prepared; live acceptance is still required; this document does not claim a remote probe passed. The production deletion Worker composition, Auth-admin secret, billing-mode confirmation, rate-limit binding and public feature enablement are also pending. Keep the main Worker configuration unchanged.

## Validation

Six focused adapter tests cover parameter forwarding/fresh connections, forbidden role identities, unsafe URL variants, pooler username scoping, sanitized query failures without retries and a stalled connection deadline. Mock tests verify adapter decisions, not real TLS, Supavisor or hosted SQL execution.

References reviewed:
- https://node-postgres.com/apis/client
- https://node-postgres.com/features/ssl
- https://developers.cloudflare.com/workers/tutorials/postgres/
- https://supabase.com/docs/guides/database/connecting-to-postgres

Validation completed: npm test 181/181; Wrangler 4.152.0 deploy --dry-run built a 201.39 KiB module (41.90 KiB gzip); Miniflare loaded that exact bundle and confirmed GET/POST/DELETE return 404 while missing-secret private RPC returns a sanitized passed:false result without network access. Reproduce the bundle test with `node tools/worker/deletion-database-probe-test.mjs <dry-run-output>/database-probe.js`. No Cloudflare upload or live database connection was performed.


## Runtime identity and operator probe — 29 October 2026

Prepared migration: `20261029131306_deletion_runtime_identity.sql`. **Not installed:** normal automatic approval review rejected creation of a permanent production LOGIN role with deletion capabilities until the user explicitly authorizes that scope. No workaround or retry was performed. Existing executor role is unchanged. The proposed login has PASSWORD NULL (no password-based connection possible yet), connection limit 4, no administrative/bypass attributes, and only executor membership with INHERIT TRUE, SET FALSE, ADMIN FALSE. Role defaults set statement timeout 2s, lock timeout 1s and idle-in-transaction timeout 2s.

The composed PostgreSQL fixture now runs its service queries as the runtime identity inheriting the executor role, rather than directly as the executor. Membership flags and the entire archive-failure/provider-failure/retry/completion sequence pass. This is simulated PostgreSQL coverage, not hosted password authentication.

After that migration is authorized and installed, set a unique password privately in an existing trusted administrator `psql` session using:

```text
\password followkit_deletion_runtime
```

psql prompts twice without echoing the password. Connect to the project's verified TLS endpoint; do not put the administrator password in a shell command, repository or chat. This step requires a local psql installation and trusted project certificate configuration where applicable. Store the new runtime password in your password manager. The database password is separate from an app user password or Supabase API key.

Follow the deployment and secret steps above, then use the local-only caller (do not deploy this caller):

```powershell
npx --yes wrangler@4.152.0 dev --config wrangler.database-probe-caller.jsonc
```

In a second PowerShell window:

```powershell
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8792/probe' -Headers @{'X-FollowKit-Probe'='1'} | ConvertTo-Json
```

Success must be `passed:true`, `scope:deletion_database_read_only`, `productionDeletionWritten:false`. Stop the local server with Ctrl+C afterward. Only share that result, not the connection URL or password. A failure is not permission to enable production deletion or relax TLS.

The caller accepts only loopback POST /probe with the fixed header and no Origin/query string; it accepts no SQL, user ID or token. It calls only the fixed private verify() method and strips unexpected provider output. Two additional tests cover request rejection before RPC and sanitized success/failure responses. No remote probe or real deletion was run.
