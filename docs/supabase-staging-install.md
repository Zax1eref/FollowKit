# Supabase staging installation — 26 October 2026

## Applied migration mapping

The user-designated staging project was ACTIVE_HEALTHY on PostgreSQL 17.11. Its public/followkit_private table inventory and migration history were empty before installation. Existing managed Auth columns id, email_confirmed_at and is_anonymous were inspected; managed Auth schema was not altered.

| Source | Recorded migration | Name |
|---|---|---|
| database/postgres/001-foundation.sql | 20261026064536 | followkit_foundation |
| database/postgres/002-mutations.sql | 20261026064620 | followkit_mutations |
| database/postgres/003-network-contract.sql | 20261026064646 | followkit_network_contract |
| database/postgres/004-account-provisioning.sql | 20261026064659 | followkit_account_provisioning |

All four apply calls succeeded and their history entries were read back. Migration source was unchanged. Do not reapply these CREATE scripts to this project; use a new additive migration for subsequent changes. The old local checkpoint hashes refer to the pre-import source repository.

## Verified evidence

[CI run](https://github.com/Zax1eref/FollowKit/actions/runs/40281596660), commit 2bcd413a9fc66f9153ab5562238dc8d00c910a0c: both native (17) and native (18) jobs succeeded. PostgreSQL 17 logs report 17.11 and three separate 5/5 results. Identity is simulated in CI; the service does not connect to Supabase.

Live catalog checks: all nine application tables enable RLS. The five public tables grant authenticated SELECT only, with owner-scoped policies via active_owner; all four private tables deny direct client reads/writes. Anon has no table SELECT or application-function EXECUTE. All 17 application/helper functions pin search_path; internal quota/lock/tombstone helpers deny authenticated EXECUTE. The active_owner helper is callable for SELECT policies.

A transaction with SET LOCAL ROLE verified: anon SELECT and onboarding RPC reject with insufficient_privilege; authenticated without a subject sees zero accounts and cannot call onboarding or save a customer. Transaction was rolled back. Accounts, customers and quotes remain at zero. No test Auth identities, emails, real customer records or deployment were created.

## Advisor findings and disposition

- **10 WARN: authenticated SECURITY DEFINER RPCs.** Intended RPC-only mutation/provisioning boundary; authenticated cannot write tables directly. Each mutation derives owner from auth.uid() through lock_owner, filters foreign IDs, and pins search_path. Onboarding verifies the provider-owned confirmed/non-anonymous Auth record. These are still privileged API surfaces requiring live two-user/foreign-ID tests before beta. No broad grants were added to suppress the warning. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- **4 INFO: private tables have RLS with no policy.** Deliberate default deny for ledger, tombstones, dedup and payment events; client table privileges were also revoked. Do not add allow-all policies. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- **2 INFO: composite foreign-key indexes.** The existing indexes start with (account_id, customer_id) and (account_id, quote_id, ...), while the FK declarations list the pair in reverse order. Both equality columns are in the leading index prefix. Catalog inspection confirms the indexes exist; no duplicate index was added just to suppress the notice. Query-plan/load verification remains pending. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).
- **5 INFO: unused indexes.** Expected before data/workload exists; do not remove ownership/due-date indexes solely from empty-project counters. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

## Remaining gates

Confirm the actual Auth settings (email confirmation, anonymous login disabled, exact callback/recovery allowlist), choose the Cloudflare staging project/origin, configure public bindings, then validate signup/confirmation/reset/login with approved test recipients. Test Worker and direct REST/RPC isolation with two real test identities, token-revocation bounds, and deletion/restore reconciliation. The SQL-role smoke test does not replace any of these.

No claim of a warning-free Advisor report, public-beta readiness, deployed UI, market validation or new paying users is made. Default committed Worker configuration remains disabled. Supabase changelog was checked before installation; the upcoming TLS cipher retirement concerns legacy HTTP clients, not this DDL installation. No CLI/bootstrap fake Auth schema was applied to the hosted project.
