# Test account deletion — 24 October 2026
This feature only exists in the explicitly enabled synthetic A/B harness. It is not production account erasure, provider account deletion, billing cancellation or a compliance claim.

## Workflow
Select a synthetic account, choose “ลบบัญชีทดสอบนี้”, optionally export JSON, then type the exact displayed phrase, for example DELETE test-A. The submit button remains disabled until it matches. Cancel or Escape closes without deletion; while a submitted deletion is pending, dismissal is disabled.
The server independently requires the exact phrase for the session's current owner and rejects extra fields. The client never selects a target account ID. Switching accounts in another tab makes the old phrase invalid.
DELETE /__test/account requires same origin, CSRF, active synthetic session and JSON under the existing 16 KiB request limit. Deletion attempts have a separate per-owner limit of 5/minute. The general API does not expose account deletion.

## Transaction and session behavior
One SQLite transaction deletes the authenticated account's request_dedup, followup_events, quotes, customers, subscriptions, then accounts row. A failure rolls everything back; sessions remain valid on failure. All current sessions for that account are revoked only after a successful commit, and the response expires the current cookie. Other accounts and their sessions remain intact.
The session is revalidated after awaiting the request body. API identity liveness is checked after the authentication await, before automatic account initialization, to prevent a revoked identity recreating an account at that boundary. Identity liveness is supplied by the test harness; no real provider revocation integration exists.
Old sessions cannot read, export or repeat deletion. Explicitly selecting the same synthetic A/B fixture again creates a fresh empty account; this is intentional test behavior, not recovery. Its prior dedup responses are gone.

## Data that remains
Already exported JSON and existing backups are unchanged. Restoring an old full backup can restore deleted data: production needs an erasure ledger/reconciliation process and a retention policy before making deletion guarantees. SQLite free pages/WAL may retain bytes; no secure physical erasure is implemented. Global payment_events contain provider/event IDs and timestamps with no account mapping, so this test operation leaves them unchanged. Real payments, retention obligations, provider deletion and recent-auth requirements remain unimplemented.

## Evidence
54/54 automated tests and build pass. Eight deletion tests cover complete owner cleanup, B preservation, all-session revocation, wrong/stale/injected confirmation, CSRF/origin/auth, rollback on forced failure, fresh fixture creation, body bounds/rate limits, missing generic route, pending-body revocation and post-auth liveness.
All destructive test operations use newly created in-memory synthetic fixtures. Existing .local/test.sqlite and recovery backups were not deleted or changed by these tests.
The confirmation dialog was checked in Chrome for wrong/correct phrase gating, reset on reopen, Tab/Shift+Tab, Escape, cancellation and focus restoration. Disabled-button appearance was corrected and visually checked. No actual browser deletion occurred; in-flight dismissal, full accessibility and physical-mobile checks remain pending. See project/qa-deletion-ui.md.
