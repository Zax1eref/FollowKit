# Backend spike — 24 October 2026 / continuation session
Purpose: de-risk persistence, API authorization and core transactions without committing to a full CRM before customer validation.

## Executable scope
Node Fetch API handler + SQLite repository. Invoke through automated tests, not a publicly exposed listener.
createApi requires trusted authentication injection; default rejects every request (401).
Tests explicitly inject two identities A/B; production source contains no test token fallback.
Supabase adapter calls HTTPS /auth/v1/user with bearer token and public project key; rejects unconfirmed users, invalid auth, failed upstream response. Adapter tested with fake upstream responses only.

GET /api/account; GET /api/dashboard
GET/POST /api/customers; GET/PATCH/DELETE /api/customers/:id
GET/POST /api/quotes; GET/PATCH/DELETE /api/quotes/:id
GET/POST /api/quotes/:id/followups
POST /api/billing/checkout →503 payment_not_configured
Customer PATCH currently requires complete name/contact payload (not arbitrary partial patch); quote PATCH merges allowlisted fields.
Collections currently return first 500 records; cursor pagination is NOT implemented. UI not yet connected.

## Verified boundaries
All SQL queries include authenticated account_id, not owner from input. Client owner/plan fields rejected.
Cross-account list/read/update/delete denied in API integration tests; foreign customer reference denied.
Free account max 10 pending quotes. Reopening a closed quote consumes capacity too; quota and write in BEGIN IMMEDIATE transaction.
Parallel request test covers 12 promises in one Node process, not distributed/multi-worker concurrency.
Follow-up event + next date update atomic; same idempotency key and payload returns previous event, changed payload gives 409.
File-backed SQLite reopened with record intact; not a production backup/restore test.
JSON input limited to 16KB, content-type required; errors do not echo SQL/stack traces. Responses no-store.

## Unverified / not production-ready
No real auth signup/login/reset/logout/token refresh/session UX; no configured Supabase project.
No online DB, PostgreSQL RLS migration, rate limiting, account deletion/export, full pagination, production monitoring/backup.
Store helpers are internal and take trusted owner from API; direct untrusted code must not call Store.
Node SQLite cannot be deployed unchanged into Sites Workers. Target persistence adapter remains a decision gate.
If selecting Sites hosting, preserve its native identity integration; external Supabase auth adapter here is an isolated comparison spike, not a decision to bypass Sites identity.
Need to resolve public-user identity model before selecting production runtime: ChatGPT sign-in vs independent signup requirement.

## Official documentation checked 24 October 2026
https://supabase.com/docs/reference/javascript/auth-getuser — returned user verified by auth server
https://supabase.com/docs/guides/auth/auth-smtp — default email sending restrictions; custom SMTP needed for general audiences
https://supabase.com/docs/guides/auth/passwords — signup/login/password reset flow
These justify the integration direction, not a claim that live service tests passed.
No paid services created; no real emails sent; no secret keys stored.
