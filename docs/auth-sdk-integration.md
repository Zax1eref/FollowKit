> Updated: the standalone workspace now supports customer/quote operations; see standalone-workspace.md for current capabilities and test results.

# SDK, callbacks and Worker handoff — 25 October 2026

This increment bundles `@supabase/supabase-js` 2.118.0 into the standalone auth UI and connects its session to the Worker account endpoint. It remains a locally verified candidate: no Supabase project, real email, live session, customer data or public deployment was created.

## Build and verify

```sh
npm ci --prefix tools/auth
npm ci --prefix tools/worker
npm --prefix tools/auth run build
npm --prefix tools/worker run build
npm test
npm --prefix tools/auth test
npm --prefix tools/auth run test:sdk
npm --prefix tools/auth run test:boot
npm --prefix tools/worker test
```

Node 24.22.1. Auth output is `auth-dist/auth/{index.html,boot.mjs,style.css}`. The browser SDK is bundled locally, with no CDN or external module import. Build checks exclude fixtures/server modules from this bundle. The Worker bundle still has no SQLite or synthetic harness; it now has an ASSETS binding restricted to the auth files. Wrangler runs the Worker before all asset paths, with HTML rewriting disabled. Configuration remains disabled by default, with no public route or workers.dev URL.

## Runtime flow

`/auth/`, `/auth/callback` and `/auth/recovery` serve the same auth HTML only when valid configuration is enabled. Only `/auth/boot.mjs` and `/auth/style.css` are public asset paths; `/auth/index.html`, source modules and fixture paths are rejected. `/auth/config` returns the exact app/provider origins and publishable key, never a service secret. Responses use no-store, no-referrer and CSP limiting scripts/styles to self and connections to self plus the configured provider. Asset requests discard callback query strings and credentials before reaching the asset binding.

The browser initializes the SDK with PKCE, explicit callback handling, automatic refresh and SDK-owned localStorage persistence. No separate application token store is created. Tokens are browser-readable, not HttpOnly; CSP and XSS resistance remain security requirements. No immediate revocation guarantee is implied. SDK networking is restricted to the configured provider's auth paths, omits cookies and refuses redirects.

The callback handler removes query/fragment contents from browser history before exchange. It rejects missing/duplicate/oversized codes, provider error parameters and implicit token fragments. Optional `sb_flow_id` is validated and passed explicitly before URL cleanup can hide it from the SDK. Default SDK behavior uses its ordinary verifier storage; the experimental parallel-flow feature is not enabled. No arbitrary `next` target is followed. Only successful SDK exchange and SDK recovery events determine session/recovery state, not the route name. Failure attempts local signout and returns a generic invalid-link message; failure to clear local session leaves the page disabled.

The account bridge gets the current SDK session for each request, then sends its bearer token only to same-origin `/api/account`, without cookies or redirects. Worker provider verification and database ownership checks remain the authorization boundary. Account rows must match that session's owner; a signout, recovery event or owner switch invalidates in-flight work and clears displayed data. UI reads are deferred outside SDK callbacks; form interactions remain disabled during callback processing. Logout failure stays blocked, and late responses cannot restore account data after logout.

## Evidence and limits

| Check | Result |
|---|---|
| Node regressions/controller/callback/Worker boundaries | 93/93 |
| Form DOM suite | 5/5 groups |
| Actual SDK + Worker code, mocked provider/data | 8/8 groups |
| Actual browser bundle executed with jsdom + SDK + Worker | 2/2 groups |
| workerd with real asset binding and local outbound stub | 8/8 groups |
| Visual Chromium/mobile/full accessibility | Still pending; prior Chromium download failed |
| Native PostgreSQL concurrency/live provider | Not run; prior SQL WASM suite 18/18 unchanged |

SDK evidence includes actual challenge/verifier generation and exchange, recovery event handling, consumed-verifier replay rejection, missing verifier failure, refreshed-token handoff and session removal on logout. Provider responses are local mocks, so these tests do not establish live email delivery, expiry enforcement, cross-tab behavior, provider project settings or old-token revocation. jsdom does not verify browser navigation, CSP enforcement, visual layout or browser storage/locking behavior.

The account card reads plan/id only. No account auto-provisioning is performed. A newly verified provider user without an application account remains unavailable. The existing quote/customer UI is still the synthetic/offline harness and is not wired to this session. No paid subscription, production deletion or backup behavior changed.

Next local work: connect the existing customer/quote workspace to the standalone session with strict cache clearing and no synthetic controls; define account onboarding/provisioning and test it before staging. Then complete actual-browser callback/storage/cross-tab QA and approved real-provider lifecycle/direct-RLS/revocation/concurrency checks. Keep the default API disabled until release gates and deployment approval are satisfied.

Official references checked 25 October 2026:
- https://supabase.com/docs/reference/javascript/auth-exchangecodeforsession
- https://supabase.com/docs/guides/auth/sessions/pkce-flow
- https://supabase.com/docs/reference/javascript/auth-onauthstatechange
- https://supabase.com/docs/guides/auth/signout
