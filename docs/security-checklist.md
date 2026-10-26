# Security review — 24 October 2026
DONE (prototype): ใช้ข้อมูลสมมติ; ไม่มี API/secrets; no network submission; user text uses textContent; date/status/money validation; HTML labels/native controls; build reproducible.
NOT STARTED (production): managed auth/reset, server sessions, CSRF, RLS for every operation, server entitlements, rate limits, audit logs, consent storage, export/deletion, backups/restore, security headers, retention enforcement.
NEEDS VERIFICATION: full keyboard/screen-reader review, mobile viewport testing, CSP, third-party hosting/commercial limits.
Critical launch gate: never accept real customer data until server authorization and cross-user read/write/delete tests pass.
Schema tests do not prove tenant access control. Browser validation does not secure a server. Unique payment event key does not verify webhooks.

Continuation: API owner scoping, body-size/type/allowlist validation, default auth denial, quota/reopen limits, and followup idempotency now tested locally. Authentication is fixture-based in tests; no production security sign-off. Narrow viewport/basic keyboard tested; full accessibility still pending.

Latest local integration: synthetic sessions opaque+HttpOnly+SameSite, logout/expiry/CSRF/origin/host guards tested. Fixture identity selection deliberately offers no real-user authentication; must not be exposed publicly. Quote-create retry idempotency, provider lifecycle, rate limits and production controls remain launch blockers.
