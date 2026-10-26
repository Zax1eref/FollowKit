# ADR-014 — production target selected, not provisioned
24 October 2026 / Asia/Bangkok

## Decision
Use standalone Cloudflare Workers for the web/API runtime and Supabase Auth + PostgreSQL for the intended independent FollowKit MVP. This is an engineering target for implementation, not approval to purchase, create accounts, deploy publicly or accept real customer data. Keep the current local Node/SQLite harness for regression tests.

The PRD A1 explicitly requires signup, verified email, login, logout and password reset. Preserve that requirement. Sites hosting owns native ChatGPT identity; a Sites-native pilot would have a different identity lifecycle. We will not add an external session stack inside a Sites-hosted app. The selected standalone Worker is separate from Sites; no Site registration or manifest conversion is made here.

| Option | Fit | Decision |
|---|---|---|
| Standalone Workers + Supabase Auth/Postgres | Independent email identity, relational tenant policies; HTTP database access documented by Cloudflare | Selected engineering target |
| Sites native identity + D1 | Suitable for a ChatGPT-sign-in pilot; does not implement FollowKit password/reset lifecycle | Alternative only if PRD identity scope changes |
| Existing Node/SQLite harness online | Synthetic identities and local-file persistence are test mechanisms | Not a deployable beta |

No hosting price, email quota, commercial terms or free-tier availability guarantee is made. Verify actual plan limits, region, SMTP, backup capability and budget before provisioning. Current spend remains 0 THB. The 2,000 THB ceiling is not spending permission.

## Request and data boundaries
Browser → same-origin Worker API → Supabase user-scoped HTTP data API / PostgreSQL functions. Auth UI uses the provider-supported email/password + PKCE lifecycle, with exact redirect allowlist and verified-email gate. Do not write password storage or mint application identity tokens.
Use provider SDK session handling and prove cookie/refresh behavior in the first integration spike. Cookie-based mutations require origin/CSRF checks; responses carrying identity/session changes must not be publicly cached. Do not assume browser-assisted SSR cookies can simply be made HttpOnly without changing the SDK flow. Credentials and tokens never enter logs or committed files.

The Worker derives the owner from verified provider identity and forwards the user's token for data access. RLS is required for every exposed tenant table. Ordinary customer/quote operations must not use an admin secret. Client-supplied owner, plan and entitlement fields are not authority. All tenant policies also deny access for accounts pending deletion.

Atomic customer+quote creation, quota enforcement, followups and durable dedup move into PostgreSQL transaction functions. Lock the owner row when checking pending-job quota. Revoke generic direct mutations that could bypass these functions; test direct HTTP data access as well as Worker routes. Privileged functions must derive auth.uid(), pin search_path, restrict EXECUTE grants and never accept an arbitrary owner as authority.

## Session revocation is a release gate
Provider sign-out revokes refresh tokens, but already-issued access JWTs may remain valid until expiry [S3]. Do not equate JWT signature verification with live-session revocation. The existing remote auth adapter is only contract-tested; its user lookup is not proof of immediate revocation across every route.
Before release, test replay of an old token through both Worker and direct data API after logout/deletion. Implement a provider-supported live-session check and/or a DB-enforced revoked-session/account denial mechanism with an explicit bound. Do not mark PRD logout/revocation complete until this passes. An account tombstone must block old tokens before any provider-deletion retry.

## Deletion and backups
Production deletion is a retryable state machine: recent authentication + exact confirmation → mark account deleting and deny writes → revoke sessions / coordinate subscriptions → purge tenant records → delete provider identity → complete minimal deletion ledger. Failures remain blocked and retryable, not silently reactivated. Never automatically initialize a deleted account merely because an old identity token exists.
Retain only the minimal ledger needed for restore reconciliation, under an explicit retention policy. Keep it outside the backup set being restored; replay completed deletions before reopening restored data. Restore drill must prove deleted accounts stay absent. Existing local backups and synthetic deletion do not implement this architecture.

## Evidence checked 24 October 2026
[S1] Cloudflare documents Supabase integration with Workers: https://developers.cloudflare.com/workers/databases/third-party-integrations/supabase/
[S2] Supabase password auth, verification and redirect setup: https://supabase.com/docs/guides/auth/passwords
[S3] Sign-out scopes and access-token expiry caveat: https://supabase.com/docs/guides/auth/signout
[S4] RLS grants/policies and privileged-key boundaries: https://supabase.com/docs/guides/database/postgres/row-level-security
[S5] SSR cookies/session refresh: https://supabase.com/docs/guides/auth/server-side/advanced-guide
[S6] Worker Node compatibility includes unsupported/stubbed APIs; not a local SQLite deployment guarantee: https://developers.cloudflare.com/workers/runtime-apis/nodejs/
Sites comparison uses the current Sites identity/storage skill references; those describe platform-managed identity and D1 rather than this standalone deployment.

## Work completed in this increment
Architecture selected; migration and acceptance packet written. Extracted Fault into errors.mjs so auth.mjs and api.mjs no longer import the Node SQLite repository just to share an error type. The SQLite store re-exports Fault for compatibility. All 54 existing tests and build pass after this refactor.
No Supabase project, Worker, provider secret, live session, PostgreSQL migration or real email was created/tested. The API still expects synchronous Store methods: removing an import is only the first portability fix, not an asynchronous production repository implementation.
