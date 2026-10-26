# Current architecture decision
See production-decision.md and production-migration-plan.md (24 October 2026). Standalone Cloudflare Workers + Supabase Auth/PostgreSQL selected as the implementation target; not provisioned. Local Node/API/SQLite remains the only working runtime. Earlier provisional notes below are historical.

# Architecture and technical decisions
## Implemented today
Static HTML/CSS/JS, build script inline source → standalone dist/index.html.
Browser memory store only → domain validation → safe textContent rendering.
Node built-in test runner and SQLite relational schema tests; no runtime server and no connection between UI and SQL.
Cost: no installed paid service, no external runtime dependency.
SQLite fixture intentionally not a production auth boundary; composite FK prevents cross-tenant references, not SELECT leakage.

## Target MVP (provisional until validation)
Web frontend → authenticated API/BFF → managed auth + PostgreSQL with row policies.
Choose Supabase Auth/Postgres as candidate due to managed identity and relational data; hosted application candidate Sites server runtime subject to verifying secret storage and commercial hosting limits. No account created yet. Static demo code remains reusable; no framework selected until runtime integration spike passes.
Alternative: Next.js + PostgreSQL on commercial-eligible host. Reject choosing a hosting free tier solely by cost before checking permitted commercial use, database, secrets, and logs.
Supabase official pricing checked 24 October 2026: free DB 500 MB/project; inactivity pause after one week noted in retrieved pricing. Email sending, backups and production availability need separate validation before deploy. https://supabase.com/pricing

## Model
accounts 1:N customers 1:N quotes 1:N followup_events; each child stores account_id.
accounts 1:1 subscriptions; payment_events unique(provider,event_id).
SQL prototype included in database/001-foundation.sql; adapt to PostgreSQL UUID/date/timestamptz and RLS migrations before deployment.
Use customer IDs, never customer name as unique production identity. UI demo's distinct-name count is only sample metric.
Dates are calendar dates in Asia/Bangkok; audit timestamps UTC; money integer satang.

## Authentication and authorization design — not implemented
Browser signup/login/reset through managed provider. Server validates session on every request, derives account_id from session, never accepts account_id from request as authority.
HttpOnly Secure SameSite cookie via server where feasible; CSRF protection for mutations; session expiry/revocation.
Postgres row policies SELECT/INSERT/UPDATE/DELETE bound to authenticated membership/owner, WITH CHECK on writes; service key only in server secret store. Security test with 2 accounts plus anonymous user required.

## API contract — proposal
GET /api/quotes?status=pending&due_before=YYYY-MM-DD → 200 {items,next_cursor}
POST /api/quotes {customer_id,title,amount_satang,sent_on,due_on} → 201 {quote}; server assigns owner; free-limit checked transactionally
PATCH /api/quotes/:id {title,status,due_on,...} → 200; foreign ID →404
DELETE /api/quotes/:id →204 with owned-row verification
GET/POST/PATCH/DELETE /api/customers similarly; bounded pagination and allowlisted fields
POST /api/quotes/:id/followups {note,next_due,idempotency_key} →201 atomically
GET /api/account →200 {plan,status,limits}; no client plan setter
POST /api/billing/checkout →503 payment_not_configured until approved provider
POST /api/billing/webhook raw body signature check, unique event in transaction, reconcile provider truth
Error envelope {error:{code,message,request_id}}; 400 invalid, 401 no session, 404 missing/not owned, 409 conflict/plan limit, 429 rate limit; never include secrets or stack trace.

## Subscription state machine — proposal
free → trialing (optional) → active only after verified provider event.
active → past_due on failed invoice → active on verified recovery; grace duration must be explicit.
active → canceled with access retained until current_period_end → expired/free.
Never grant paid on checkout redirect; reject stale events; process same event once; reconcile out-of-order state using provider API.
Provider not selected; Thai availability, KYC, fees, recurring support and refund/cancellation terms not yet verified. No payment-ready claim.

## Operations before real users
Rate-limit auth/reset/interest/mutations; validate server inputs; CSP and security headers; redact contact/body/token data in logs; structured request ID and minimal error counter.
Daily encrypted backup with retention 7 days as proposed policy; restore to separate test DB and verify owned row counts before launch. Confirm provider availability/cost first; schema migration is not a backup.
Local-only config `.openai/hosting.json` declares dist. No project_id or hosting registration; no public deployment.

## Continuation supersedes implemented-today section (24 October)
Local API/repository now implemented in src/server, with fixture-auth integration tests. See backend-spike.md for exact scope and limits. UI still memory-only.
Server spike validates owner scoping and transactional quota/history on SQLite. It is not deployable as-is to Workers and is not evidence of PostgreSQL RLS.
Production identity/runtime remains unresolved; Sites hosting requires native identity integration. No external auth has been activated.

## Integrated local runtime update (24 October, latest)
Browser client now uses same-origin API under explicit test harness; Node HTTP → API → SQLite. Synthetic A/B sessions are test-only, not production auth. Customer+quote draft is transactional; history/metrics persisted. See test-runtime.md for exact mode distinction and limits. Earlier statements that UI is not connected are historical.
