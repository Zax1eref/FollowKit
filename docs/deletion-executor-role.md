# Restricted deletion database role — 27 October 2026

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
