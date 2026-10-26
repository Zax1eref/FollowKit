# Async API and HTTP repository — 25 October 2026
Status: implemented and tested with mocked HTTP plus PostgreSQL WASM; not connected to a Supabase project or deployed Worker.

## API contract
createApi accepts either the existing store or an async repositoryFor({identity,request}) factory. It awaits authentication, identity liveness, repository creation and every data operation. Rejections become the existing sanitized error envelope. Identity is rechecked before each repository call, including after parsing an asynchronous request body.
The data interface is account, get, page, customer, deleteCustomer, createQuote, quote, deleteQuote, followups, followup, dashboard, exportAccount. Each method receives trusted owner as its first argument and may return a Promise. createQuote owns the complete atomic/dedup operation; API no longer passes a synchronous transaction callback through an async repository.
The local Store remains synchronous internally. Its new createQuote wrapper preserves existing transaction/savepoint and retry behavior. The same awaited API continues serving the local browser harness; 54 previous tests continue passing.

## HTTP adapter
src/server/http-repository.mjs exports createHttpRepository and httpRepositoryFactory. Each factory invocation captures a separate immutable owner and bearer token. There is no shared global auth client/token. Owner mismatch fails before a request.
Configuration requires an HTTPS origin (no path, credentials, query or fragment), a new-format sb_publishable_ key, verified UUID owner and Bearer authorization. Legacy anon JWT keys and secret/service keys are intentionally not accepted by this adapter. Configuration is supplied by the caller; no environment auto-load or production listener is installed.
HTTP calls use /rest/v1 tables or /rest/v1/rpc functions; redirects are rejected. Mutations use RPC only. User tokens preserve database RLS. Reads also include owner filters and verify returned owner IDs. Keys/tokens/upstream details are never returned in error bodies or logged by the adapter.
Account lookup is read-only and rejects absent/inactive accounts; it never provisions an account from an old token. Current synthetic account creation remains solely in the local Store/harness.
Default transport bounds: 5 seconds including response body consumption; 5 MiB response maximum. Timeout yields 504 database_timeout; unknown provider failures yield 503 database_unavailable; malformed/oversized responses yield 502. Known validation/conflict messages map to existing API codes. No write retries occur automatically, because a timeout does not prove rollback; callers may retry quote creation using the original idempotency key.
Pagination requests exact filtered count and limit+1; Content-Range is required so a provider row cap cannot silently make a partial collection look complete. Cursor contains owner/table/last UUID and cannot be reused for another owner or table. Cursor is an opaque position, not authorization; RLS/owner checks provide authorization. Pagination is not snapshot-stable across separate requests.
Followup fields are converted to the local client's JSON-encoded note format. Dashboard rejects unsafe integer totals. Export uses one SQL function for snapshot-consistent assembly and fails instead of silently truncating above the transport size bound. Large async export jobs are not implemented.

## Additive migration 003
003-network-contract.sql leaves migrations 001/002 unchanged and adds:
- fk_create_quote_scoped: quote versus quote-draft dedup scopes remain distinct.
- fk_patch_quote: merges only allowlisted patch fields inside the owner-locked transaction, avoiding HTTP read-merge-write races. Reopening still checks quota.
- fk_dashboard, fk_followups_json, fk_export_account: invoker-rights JSON results under RLS with inactive-owner rejection.
All new functions pin search_path and revoke PUBLIC/anon execution. Reload PostgREST's schema cache after applying migrations in a future test project. Existing initialization, deletion orchestration, live-session revocation and payment gates remain unresolved.

## Evidence
66/66 Node tests (12 new network/async tests) and build pass. Tests cover delayed CRUD/history/export, async rejection, identity revocation during account lookup, concurrent A/B token separation, unsafe config/owner denial, atomic RPC payloads, server pagination caps, scoped cursors, no automatic provisioning, safe error mapping, header/body timeout, no implicit write retry, response bounds and legacy client mapping.
18/18 PGlite SQL groups pass (4 added): scoped retries, atomic partial patch, invoker summary/export/history, and adapter arguments/results executed against the SQL functions through a test transport. This bridge simulates HTTP and provider identity; it is not a PostgREST or Supabase integration test. PGlite is single-connection and does not verify production concurrency.
No UI changed, no new browser QA claimed, no real data sent externally. No service account, project, secret, email or deployment was created; spend remains 0 THB.

## Next
Create a separate Worker entry with fail-closed config/auth and no /__test routes, then validate the real provider HTTP shape, Content-Range, schema grants, async cancellation and auth lifecycle in an isolated authorized test project. Confirm live-session revocation separately; a successful user/token lookup alone is not sufficient evidence. Keep the current Node/SQLite listener local.
Sources checked: https://supabase.com/docs/guides/api and https://docs.postgrest.org/en/stable/references/api/functions.html
