# Private deletion job persistence — 27 October 2026

Candidate migration, not applied to hosted Supabase. Created with Supabase CLI migration new. No live data or public API changes. Apply only after native concurrency validation and the production worker/role design is complete; do not blindly db push the repository's mixed historical migration layout.

The private deletion_jobs table stores one irrevocably confirmed job per subject, independent of account/Auth foreign keys so the record survives account erasure. Client roles have no table or function privileges, RLS is enabled without client policies, and functions use SECURITY INVOKER with an empty search path. No new role privileges are granted. Job creation remains an internal responsibility of a future trusted admission service; a timestamp alone is not proof of authenticated user confirmation.

claim_deletion_job uses FOR UPDATE SKIP LOCKED to claim one due unfinished row, issuing a fresh UUID lease token for five minutes and incrementing attempts. retry_deletion_job requires the current unexpired token, accepts only a fixed failure-stage enum and reschedules one minute later. Identity/confirmation cannot change; completed records cannot reopen. There is intentionally no completion function that blindly trusts caller booleans.

A lease serializes claims while valid; it does NOT stop an old process or an in-flight provider call after expiry. Downstream idempotency and fencing, bounded effects, lease renewal/revalidation and adapter integration remain necessary. This schema alone is not a running retry scheduler and is not yet connected to deletionWorkflow. No automatic polling, cron, public RPC or deletion is enabled.

Verification: node tests/postgres/deletion-jobs.mjs uses actual PostgreSQL WASM and synthetic records. Three groups cover client denial/deduplication, active lease exclusion/expiry reclaim/stale-token denial/retry delay, immutable identity/completion and absence of cascading account dependencies. This sequential embedded test is not a native multi-connection race test. Native PostgreSQL 17/18 concurrency and hosted advisors are pending before deployment.

Integration ordering corrected: the coordinator now separates revokeSessions from removeIdentity, purges app rows before deleting the Auth user, and retains the tombstone/job. The candidate failure-stage enum includes revokeSessions. This migration has never been applied to hosted Supabase; the candidate was updated in place. Actual provider adapters are still absent.

Current Supabase changelog and RLS documentation were reviewed. This change uses ordinary PostgreSQL tables, row locks and invoker functions; no new SDK dependency or managed Auth mutation.
