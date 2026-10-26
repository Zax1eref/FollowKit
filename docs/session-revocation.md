# Active-session enforcement — 27 October 2026 (Asia/Bangkok)

The live logout report showed Worker denial at the first post-logout sample, but the same token still read its account through PostgREST. Both endpoints denied at the post-expiry sample 2,215 seconds later; the exact transition was not measured.

## Change applied

Migration `require_active_session` was applied successfully to project `kfnputowvfxozdiuhpzo`, hosted history version `20261026194930`. Its source is `supabase/migrations/20261026194730_require_active_session.sql`, created by the Supabase CLI. The source-generation timestamp differs from the hosted apply timestamp. Earlier baseline scripts 001–004 remain under `database/postgres`; apply the new migration after them for a fresh environment. Do not blindly run `supabase db push` against the existing hosted history or reapply baseline scripts.

The private, non-client-callable `session_owner()` checks that the signed request's `session_id` is a UUID, belongs to `auth.uid()`, exists in `auth.sessions`, and has no elapsed `not_after` bound. Missing, malformed, mismatched, expired or removed sessions raise SQLSTATE 42501 with a generic unauthorized message. It uses no user_metadata.

`active_owner()` calls this guard before the account/tombstone check, covering the five public-table SELECT policies and invoker RPCs. `lock_owner()` calls it before locking an account, covering all mutation RPCs including legacy endpoints. Onboarding and provisioning also call it. Existing ownership, quota and tombstone checks remain. The helper is SECURITY DEFINER only to read the provider-owned session table, uses an empty search_path and fully qualified objects, and denies direct execution to PUBLIC/anon/authenticated. No client grants on auth.sessions were added. No live Auth session, user or customer rows were edited.

This affects new database statements after logout is committed and visible. It does not cancel already-running statements, invalidate JWT signatures globally, remove browser storage, or claim transactional serialization with a concurrently executing logout. Long-lived database snapshots are outside the ordinary PostgREST request model. There is no cached session-validity decision across requests.

## Verification

- Node regression suite: 140/140.
- New PostgreSQL WASM suite: 7/7 groups covering valid sessions, malformed/missing/foreign IDs, session deletion, all five table reads, all 13 public RPCs, another active session/account, expired not_after, helper permissions and tombstone preservation.
- Historical baseline PostgreSQL WASM suites: 18/18 and provisioning 10/10, run against baseline 001–004. The new dedicated suite covers the latest migration.
- Hosted read-only transaction: real existing active-session claims accepted; absent-session claims denied on reads and all 13 RPCs. No managed Auth records were altered. This is role/claim simulation on the live database, not an actual HTTP logout replay.
- Native PostgreSQL 17/18 CI now applies the latest migration and runs six groups, including cross-connection session deletion visibility. Record CI outcome separately; do not infer a pass from configuration alone.

The post-change security advisor had the same findings as before: ten intentional public privileged RPC warnings, four private default-deny RLS informational findings, and leaked-password protection disabled. No new session-helper warning appeared. These findings were not suppressed or silently reclassified as resolved. References: [privileged RPC lint](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [default-deny RLS lint](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Live retest

Sign in again to a synthetic test account and run the existing `scripts/live-logout.mjs --logout-test-account --wait-until-expiry` using a new access token and the masked PowerShell block in `live-logout.md`. The expected result is both endpoints denied in the first post-logout sample, with `immediateRevocation: true`. PostgREST may return 403 for SQLSTATE 42501 on a still-cryptographically-valid JWT; this is an expected denial, not a requirement for status 401. The runner should finish without waiting for expiry when both deny. This HTTP retest remains pending user execution.

Afterward, rerun two-account read/write checks with fresh sessions to confirm normal workflows end to end. Do not send access tokens in chat.

## Recovery

If legitimate sessions fail, first inspect whether a current access token contains a provider-issued session_id and whether its corresponding session exists; sign in again before considering rollback. A rollback restoring the four function definitions from migration 004 would reopen the measured post-logout access window. Do not disable session validation merely to make a test pass, and do not grant client access to auth.sessions.

Provider guidance: [session revocation checks](https://supabase.com/docs/guides/auth/sessions#how-to-ensure-an-access-token-jwt-cannot-be-used-after-a-user-signs-out).
