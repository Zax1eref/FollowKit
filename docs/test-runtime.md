# Integrated test runtime — 24 October 2026
**Synthetic data only. This is not production authentication.**

## Run locally
Node.js 22+ with node:sqlite (tested on 24.19.0). No external package installation required.
Extract ZIP, open terminal in followkit, run:

```sh
npm test
npm run build
npm run dev
```
Open http://127.0.0.1:4173/#dashboard and select synthetic account A or B.
Default npm run dev binds 127.0.0.1. Managed preview supplies host/port flags; server honors them for internal QA.
Do not expose this harness on a public host. NODE_ENV=production refuses startup, explicit --synthetic-accounts is required, known-host allowlist enforced. These guards do not make fake identities safe for production.

## Verified workflow
Create new customer + quote atomically, or explicitly select an existing customer.
Edit quote fields/status, delete a quote, view/edit/copy Thai message, record follow-up + next due, inspect history.
Browser reads customers/quotes/dashboard via same-origin API. Data persists in .local/test.sqlite across refresh and server restart. Runtime DB excluded from source archive.
Synthetic session opaque token is server-generated, HttpOnly, SameSite=Strict, expiry one hour; logout revokes it. No password/email/provider signup.
CSRF header and exact same origin required for test mutations. Test session selection is intentionally open to anyone reaching this private/local harness; it cannot protect real accounts.
SQLite store limits free pending jobs to 10 server-side. Named customer chosen explicitly; draft rollback removes newly created customer if quote fails.

## Offline artifact
FollowKit-Prototype.html remains standalone memory-only. It does not connect to API when opened as a file.
The /offline.html test route serves this same standalone behavior for regression checks.

## Limits
- Real registration/login/password reset/logout with an identity provider NOT implemented/tested.
- No deployed site/online DB. Do not count synthetic session selection as signup or customer activation.
- Customer manager edits name/contact and deletes unlinked customers; linked quotes block deletion with 409.
- API collections use owner/table-scoped cursors, default 100/max 200 rows. UI fetches all pages; no virtualization or snapshot-consistent concurrent pagination.
- Follow-ups and quote creation are idempotent. Quote POST requires Idempotency-Key; owner/scope/key + canonical payload and response persist in request_dedup. Changed payload with same key returns 409. Browser key persists only within the open form, not across reload; no dedup expiry/cleanup policy yet.
- Local per-process owner limits: reads 120/minute, writes 30/minute, 10,000 active bucket cap; returns 429 and Retry-After. Not distributed; auth endpoints/IP abuse controls, account deletion, production backup/retention, payments and monitoring remain incomplete. Local account JSON export and operator backup/restore are implemented; see data-recovery.md.
- This Node SQLite harness is not directly deployable to Sites Workers; production runtime/identity still a decision gate.
- No broad framework/CRM expansion until customer validation.

## Test account deletion
Confirmed deletion is implemented only in /__test/account: owner-bound typed phrase, atomic tenant cleanup and all-session revocation. This does not erase old backup/export files or provider identities. See account-deletion.md.
