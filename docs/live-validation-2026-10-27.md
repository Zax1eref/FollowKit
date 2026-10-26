# FollowKit live deployment validation — 27 October 2026 (Asia/Bangkok)

Validated origin: https://followkit.hakimihaika219.workers.dev
Source commit: a1a8318678be6ae954654c1502be198a14a86206.

## Live read-only HTTP checks

All 14 requests returned the expected status. Requests used a descriptive FollowKit-Deployment-Check/1.0 user agent, bounded connection/request timeouts, and no user credentials. No application records or Auth settings were changed and no emails were sent.

| Check | Observed |
|---|---|
| /auth/, /auth/callback, /auth/recovery | 200; HTML identical to committed asset |
| /auth/config | 200; enabled; expected application and Supabase origins |
| /auth/boot.mjs, /auth/style.css, /auth/thai.woff2 | 200; byte hashes match local files, whose Git blob hashes match source commit |
| /api/account, /api/customers, /api/quotes, /api/account/export without bearer | 401 |
| /__test/info | 404 |
| /api/account with foreign Origin | 403 |
| /api/account with deliberately invalid bearer | 401 |

The auth page returned Cache-Control: no-store, X-Content-Type-Options: nosniff, Referrer-Policy: no-referrer, and a CSP restricting scripts/styles/fonts to self, connections to self and the configured Supabase origin, and denying framing. Serving callback/recovery HTML does not prove that an email-code exchange succeeds.

## Evidence retained from preceding checks

The user reported successful signup confirmation, login, customer/quote creation, persistence, two-account UI isolation and completion of the reset test. These are user-reported lifecycle results, not automated live assertions.

The preceding read-only database check simulated authenticated claims for both existing accounts and verified owner-only visibility across the five public tables, no direct client table writes, and no client access to the four private tables. This is SQL-role evidence, not a test using two actual bearer tokens through PostgREST.

Local regression results from the preceding step: Node 116/116; auth DOM 5/5; SDK integration 8/8; bundled-entry DOM 9/9; workspace DOM 3/3; workerd 9/9; Chromium 8/8. Provider/data responses in these local tests were mocked.

## Remaining acceptance work

- Real authenticated cross-account HTTP attempts through Worker and direct PostgREST, using approved test sessions without recording tokens.
- Live expired/reused/wrong-browser recovery links and actual post-logout token revocation bound.
- Restore rehearsal with an authoritative retained deletion ledger; provider deletion/export orchestration and retention decisions.
- Physical-device and full accessibility checks; distributed abuse controls and rollback rehearsal.

This report supersedes earlier claims that the deployment has not been configured. It does not establish public-beta readiness or authorize paid services or use of real customer data.
