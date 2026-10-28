# Restricted deletion database role

**Current status — 28 October 2026:** the executor role and all six infrastructure migrations are installed. Hosted role migration version: `20261028154435`. No login credentials, runtime connection or public deletion enablement have been provisioned. Zero deletion jobs exist. The sections below preserve the design and installation history; the latest verification at the end supersedes earlier candidate/pending descriptions.


Candidate migration ONLY. The ownership-only blocker reported on 27 October was incorrect: Supabase's supautils can authorize policy DDL without table ownership. Read-only inspection on 28 October confirmed the live supautils.policy_grants entry for postgres includes both auth.users and auth.sessions. These tables remain owned by supabase_auth_admin with RLS enabled. No production role, policy, grant, password or user-data change has been made. Actual installation and acceptance testing are still pending.

followkit_deletion_executor is NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION and NOBYPASSRLS. No membership is granted to anon/authenticated/authenticator, and no login or credentials are created. It reads only required Auth identity/session columns through role-specific SELECT policies, with no Auth INSERT/UPDATE/DELETE. Auth passwords, tokens, metadata and email are not granted.

Application access is restricted to account/subscription state, owner columns, private jobs and tombstone subjects. Job insertion accepts only subject_id/confirmed_at. Jobs remain a trusted-server control plane: the role can update evidence and job state, so compromise of this credential is serious; it is not a tenant-level role. App DELETE policies require a live unfinished job with archive/session/billing evidence and retained tombstone. The role cannot delete jobs/tombstones/ledger, read payment events or customer contents, or edit account plan. Subscription UPDATE(status) is granted solely to permit row locking; its UPDATE policy WITH CHECK(false) rejects actual updates. No schema-wide blanket grants are used.

The unapplied admission migration removes FOR SHARE on managed sessions because PostgreSQL requires UPDATE privilege for that row lock. It rechecks session ownership/expiry and recent-auth timestamp after waiting for application locks. As with ordinary request authentication, a revocation after the final check is not retroactive cancellation of an admitted irreversible request. No Auth write privilege is added.

Verification: the composed PostgreSQL WASM test now enables RLS on simulated Auth tables, adds a private email column, and runs all service database queries under this restricted role. Four groups pass: denial of Auth writes/private-email reads/retained-authority deletion/plan-billing edits/unready purge; archive outage; provider outage; full retry completion preserving the other account. Role attributes and absence of authenticated membership are checked. Provider simulation uses the fixture owner connection only, separate from the restricted service connection. Existing GitHub CI executes this suite on both matrix jobs; native server concurrency still uses its disposable administrator harness and is not claimed as restricted-role coverage.

This role is not yet provisioned, and the Worker/database transport is not yet wired. A future server login must receive only this capability set after installation and acceptance checks. Keep public deletion flags off. Native hosted-owner compatibility, managed Auth policy review, secret provisioning and isolated live acceptance tests remain required.

References reviewed: https://supabase.com/docs/guides/database/postgres/roles and https://supabase.com/docs/guides/database/postgres/row-level-security .

## Hosted policy authority correction — 28 October 2026

The previous conclusion based only on PostgreSQL ownership was incomplete. Supabase's documented supautils.policy_grants setting allows specified roles to CREATE/ALTER/DROP policies on named tables without owning those tables. The live setting explicitly lists auth.users and auth.sessions for postgres. The installer also has SELECT on both tables and CREATE on followkit_private. These are read-only observations, not proof that every grant in the complete candidate has been successfully installed.

The migration no longer rejects a legitimate installer solely because it is neither a superuser nor an Auth-owner member. Native GRANT and CREATE POLICY checks remain authoritative inside the single BEGIN/COMMIT transaction. Any failure requires rollback of the entire transaction; operators must not run fragments or continue an aborted transaction. No supautils settings, managed ownership, RLS bypass attributes or runtime privileges have been broadened.

The WASM fixture has no supautils. It checks that an unauthorized installer fails and rollback leaves no executor role; the existing full workflow still runs under the restricted role after fixture-owner installation. This does not simulate the hosted extension or prove hosted deployment. The prior custom ownership exception test was removed because that exception incorrectly blocked the supported platform path.

Next: review/apply the complete candidate migration chain using the existing installer authority, verify column grants and role-specific policies, then wire a separately provisioned restricted runtime connection. Do not expose the database administrator credential to the Worker. Public deletion remains disabled until live synthetic-account acceptance and operational configuration are complete.

References:
- https://github.com/supabase/supautils#manage-policies
- https://supabase.com/docs/guides/platform/permissions

The previously drafted provider inquiry was not sent; the read-only setting inspection resolves the specific ownership-only question without requiring that inquiry.

## Live installation checkpoint — 28 October 2026

The following infrastructure migrations are now installed, with hosted versions (source timestamps differ):

| Source migration | Hosted version |
| --- | --- |
| 20261027044228_deletion_job_queue | 20261028153856 |
| 20261027044623_deletion_app_purge | 20261028154022 |
| 20261027050006_deletion_completion | 20261028154032 |
| 20261027051042_deletion_free_billing | 20261028154048 |
| 20261027094406_deletion_admission | 20261028154055 |

The executor-role migration was NOT executed: automatic approval review rejected the broad production privilege grant pending explicit user authorization. This is distinct from the superseded Auth ownership issue. Do not retry or bypass that rejection without resolving authorization. The concrete pending action is creation of the NOLOGIN/NOBYPASSRLS role and its column-limited Auth reads, private job updates, account-state updates and gated application DELETE permissions exactly as defined in 20261027100318_deletion_executor_role.sql. No password or login is created, no application rows are deleted by this migration, and it does not enable the public deletion route.

Post-install verification: deletion_jobs has zero rows and RLS enabled; anon and authenticated have no SELECT/INSERT/UPDATE/DELETE privileges; all six deletion workflow functions are SECURITY INVOKER and cannot be executed by either client role. followkit_deletion_executor does not exist. No deletion job was admitted or run. The runtime is still unwired and deletion remains disabled.

Security advisors after installation show one expected new informational RLS-without-policy finding for the private deletion_jobs table. The ten existing authenticated SECURITY DEFINER RPC warnings and disabled leaked-password protection warning remain unchanged; this checkpoint does not claim a clean overall security audit. References: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy and https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .

Corrected migration/tests CI passed: https://github.com/Zax1eref/FollowKit/actions/runs/40718063320 .

## Executor role installed — 28 October 2026

After the explicit role-permission question and the user's instruction to perform the next step, the same migration was submitted through normal approval and succeeded. Hosted version 20261028154435 corresponds to source 20261027100318_deletion_executor_role.sql. The previous rejection is resolved for this action; no alternative channel or privilege workaround was used.

Live catalog verification confirms all six role attributes are false: login, superuser, create database, create role, replication and bypass RLS. anon/authenticated/authenticator are not members. Both Auth policies target only followkit_deletion_executor for SELECT. The executor has no Auth DELETE/UPDATE, session DELETE, private email SELECT, job/tombstone DELETE, account-plan UPDATE or payment-events SELECT. The six internal workflow functions are executable by the executor and unavailable to anon/authenticated. There are zero deletion jobs.

An attempted read-only SET LOCAL ROLE smoke check was rejected with SQLSTATE 42501: the connected postgres role cannot switch to followkit_deletion_executor. No membership was added to overcome this. Consequently hosted runtime execution is NOT verified; catalog checks plus prior restricted-role fixture tests are the evidence so far. Provision the dedicated runtime identity separately and test through that identity before enabling deletion. Do not use the administrator credential in the Worker.

Post-install security advisors: two informational private-table RLS-without-policy notices remain (deletion_ledger/payment_events). The ten existing authenticated SECURITY DEFINER RPC warnings and the disabled leaked-password protection warning remain unchanged. There are no newly reported warning categories from this role migration. See the remediation links in the previous checkpoint. No deletion request, app-data purge, Auth deletion or public enablement was performed.
