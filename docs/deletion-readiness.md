# Database-backed Auth deletion readiness — 27 October 2026

Implemented `deletionReadiness({database,leaseToken})` for the existing Auth adapter. This replaces the placeholder readiness callback with a concrete parameterized PostgreSQL query. No migration or permissions change is needed beyond the previously prepared queue/purge migrations. No deployment or live account access occurred.

It verifies exact job/owner/execution-token match, a live lease, incomplete job, all four recorded evidence timestamps, retained tombstone and absence from all six application tables. SQL is read-only, returns one boolean and is executed through a restricted server-side database connection. UUIDs are parameters. Any query failure or malformed result returns false. The lease token is captured at construction for one execution; it must not be fetched dynamically from the database or supplied by a browser.

Integration in the restricted deletion service:

```js
const readiness = deletionReadiness({database, leaseToken: claimed.lease_token});
const auth = deletionAuth({admin: serverSupabase.auth.admin, readiness});
// supply auth.removeIdentity to the coordinator's effects
```

Use fresh READ COMMITTED/autocommit queries, bounded database timeouts and trusted adapter evidence. Do not run readiness against a read replica or a stale REPEATABLE READ snapshot. No secret, database URL, HTTP route, worker binding or admin client is added by this change. A production connection and least-privilege role still need integration.

The database result is a point-in-time precondition, not an atomic transaction with Supabase Auth. The Auth adapter checks again after its lookup. A lease replacement during that lookup blocks DELETE, tested with actual PostgreSQL and a simulated provider. There remains an unavoidable network window after the second check; irrevocable confirmation, retained tombstone and idempotent provider operations remain required. Recorded timestamps rely on trusted evidence writers; this query does not call R2, billing or revoke sessions itself.

Verification: Node 158/158; PostgreSQL WASM purge/readiness four groups pass. Added checks cover missing individual evidence, absent tombstone, a recreated account, wrong owner and replacement lease during Auth lookup. Existing six-table purge, rollback, client denial and other-owner preservation also pass. No real Auth deletion was performed.

Remaining: supported session-revocation adapter, billing adapter, job admission, live server connection/roles, evidence writers, lease renewal and final completion verification. This internal adapter is not an active account-deletion endpoint.
