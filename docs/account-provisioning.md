# Explicit account provisioning — 25 October 2026

Verified provider identity no longer implies automatic application-account creation. The authenticated app first reads `GET /api/onboarding`. Its states are `setup_required`, `ready` and `blocked`. A new user must click the Thai confirmation button before the browser sends `POST /api/onboarding` with exactly `{ "confirm": true }`. Extra owner/plan fields and missing/false confirmation are rejected. Ordinary account and workspace API requests do not provision accounts.

The API authenticates and rate-limits both onboarding routes before selecting a per-request user-token repository. These two routes run before the usual application-account lookup, so a verified new user can complete setup without an existing account. The HTTP adapter uses `fk_onboarding_status()` and `fk_provision_account(p_confirm)`; no service/admin key is introduced.

## Database enforcement

Apply `database/postgres/004-account-provisioning.sql` after migrations 001–003 in a clean authorized test environment. Migration 004 is transactional and requires the provider-managed `auth.users.email_confirmed_at` and `auth.users.is_anonymous` columns. The test bootstrap simulates these columns; it must never be applied to a provider project.

The SQL functions derive the subject exclusively from auth.uid(), then read provider-owned user fields to require a confirmed email and non-anonymous identity. They accept no owner or plan input. The create transaction inserts the account as free/active and a free subscription together. A failed subscription insert rolls back account creation. Repeating setup for an active account returns its existing ID/plan without changing its entitlement.

An advisory transaction lock keyed by subject serializes provisioning and tombstone recording. Native multi-connection behavior, including deadlock/retry behavior under concurrent deletion/provisioning, remains a release gate; the current WASM tests are sequential and do not prove concurrency guarantees.

A new private RLS-enabled `account_tombstones` table stores subject UUID and blocked timestamp, without an auth.users foreign key. Migration backfill covers existing deletion-ledger subjects and deleting accounts. Triggers record a block when a ledger entry is inserted or moved to another subject, an account enters deleting state, or an account is deleted. Client roles cannot read or modify the table or execute the trigger helper. All new privileged functions pin an empty search_path and use qualified objects.

Tombstones block setup and are checked by both active-owner RLS and the owner-lock mutation helper. Reverting an account's state to active does not remove its block. Removing ledger rows or the provider user does not remove the tombstone; recreating the same UUID remains blocked. The block is identity-scoped, not an email ban: a genuinely different provider UUID is a different identity. This is not an immediate revocation guarantee for already-running requests.

Tombstones are retained with no automatic cleanup. Their operational retention policy and preservation outside restored backups remain unresolved. A privileged administrator can still disable triggers or erase data; production restore reconciliation must preserve/replay the authoritative deletion record before access resumes. Full production account deletion, billing coordination and provider identity deletion are not implemented here.

## Verification

```sh
npm test
npm --prefix tests/postgres test
npm --prefix tests/postgres run test:provisioning
npm --prefix tools/auth run build
npm --prefix tools/worker run build
npm --prefix tools/auth run test:boot
npm --prefix tools/worker test
```

| Evidence | Result |
|---|---|
| Main Node suite | 106/106 |
| PostgreSQL WASM regression with migration 004 | 18/18 groups |
| New PostgreSQL WASM provisioning suite | 10/10 groups |
| Bundled UI/SDK/Worker with provider/data fixture | 9/9 groups |
| workerd assets/API with outbound stub | 9/9 groups |
| Existing SDK / auth-form DOM | 8/8 and 5/5 groups |

SQL checks include absent/unverified/anonymous identities, explicit confirmation, read-only status, free-plan initialization, preserving existing paid entitlements, client privilege denial, state rollback after deleting, ledger cleanup, provider-user removal/recreation, transaction rollback and direct account purge. Bundled UI tests show no provisioning before the confirmation click, a single creation for duplicate clicks, and no setup/workspace for blocked identities. The test harness closes its own SDK BroadcastChannels after teardown so completed DOM suites exit cleanly.

No real provider accounts/emails, online database migrations, public deployment or spending occurred. Actual visual browser QA, provider-specific schema/role compatibility, direct PostgREST/JWT lifecycle, native concurrency and restore reconciliation remain unverified. Next complete a reviewable staging validation plan and browser/native integration checks before opening real signup.

Official references checked 25 October 2026:
- https://supabase.com/docs/guides/auth/users
- https://supabase.com/docs/guides/auth/managing-user-data
- https://supabase.com/docs/guides/database/postgres/row-level-security
