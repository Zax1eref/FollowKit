> Updated: SDK/callback/account integration is now implemented; see auth-sdk-integration.md for the current runtime and results. Earlier constraints below describe the prior increment.

# Standalone Worker candidate — 25 October 2026

API-only entry: `src/worker/index.mjs`. Output: `worker-dist/worker.mjs`.
This does not serve the existing synthetic/offline frontend. No deployment or real provider project was created.

## Reproduce locally

Node 24.22.1 was used. Optional build/runtime tools are isolated from the zero-install local app.

```sh
npm ci --prefix tools/worker
npm --prefix tools/worker run build
npm --prefix tools/worker test
npm test
```

The pinned esbuild build checks its dependency graph and output: seven source inputs, zero external imports, no SQLite, test-session harness or static assets. The source ZIP still includes local harness/tests for development; only the Worker bundle excludes them.
Miniflare runs the bundle in actual workerd with a local outbound stub. Seven smoke groups cover excluded routes, absent credentials, spoofed identity, cross-origin requests, successful account reads, auth/data redirects, and disabled configuration. No live Supabase, DNS or provider authentication is exercised.

## Runtime boundary

`wrangler.jsonc` starts disabled, has no public route, disables workers.dev and preview URLs, and binds no assets. The compatibility date matches the pinned test runtime. Enabling the API requires `FOLLOWKIT_API_ENABLED=true`, exact HTTPS `APP_ORIGIN` and `SUPABASE_URL` origins, and a publishable `SUPABASE_PUBLISHABLE_KEY`. Never supply a service-role/secret key. Example environment variables are comments only.

Known API routes are allowlisted; unknown/test/static paths return 404, account deletion and unsupported methods return 405. Configuration failures return 503. Supplied Origin and request target must match APP_ORIGIN; no CORS support. Only bearer credentials are accepted. Provider lookup requires an email-confirmed non-anonymous UUID; every repository binds that request's user token and owner. Cookies and asserted identity headers are ignored.

Auth has a five-second deadline covering headers/body and a 64 KiB response bound; database calls retain their five-second/5 MiB limits. Both use manual redirects and reject redirect responses. This fixes a workerd incompatibility with `redirect: error` without forwarding bearer credentials to Location targets. Runtime smoke checks outbound call counts to verify no redirect follows. Errors are sanitized; responses use no-store, nosniff, restrictive CSP and referrer policy. No production diagnostic logging remains.

## Remaining release gates

This is an API runtime candidate, not an authenticated SaaS. Signup, login/logout/reset UI, account provisioning, real Supabase/PostgREST/RLS integration and immediate revocation behavior are unverified. Native multi-connection concurrency remains untested (the SQL suite uses PGlite). Account deletion orchestration, production backups and distributed abuse limits remain incomplete. The limiter persists only within one isolate, and provider lookup occurs before it; it does not protect the auth provider from anonymous abuse. Billing is not configured. Do not deploy the synthetic harness or enter real customer data.

Evidence: `project/worker-build-results.txt`, `project/worker-smoke-results.txt`, `project/test-results.txt`. Next local work: implement the standalone authentication frontend against a mocked provider contract; then perform approved staging provider/lifecycle integration before beta.
