# Isolated PostgreSQL restore drill — 27 October 2026

## Scope

This is a native PostgreSQL 17/18 CI drill using only generated databases, roles and synthetic accounts. It does not back up, restore, purge, revoke sessions or change settings on the hosted Supabase project. No real-user records, provider keys or existing backup files are read. Previous user-supplied post-session-migration reports passed read isolation 36/36, customer writes 32/32 and quote/followup writes 58/58 with application fixture cleanup complete.

`tests/native/restore.mjs` uses the matching PostgreSQL service container's `pg_dump --format=custom` and `pg_restore --exit-on-error --single-transaction`. A separate randomly named empty target is created; existing databases are never overwritten. The generated archive and deletion manifest remain in a private temporary directory and are deleted during cleanup. No archive is uploaded as a GitHub artifact. The service is loopback-only, and the runner refuses missing/remote URLs or a missing explicit container ID.

## Seven acceptance groups

1. Create two accounts with quotes, followups, subscriptions, retry records and simulated provider sessions. Dump the database before marking account A for deletion. Restore the archive and demonstrate, offline, that the stale snapshot restores A's rows and old-session access. The target is never connected to application traffic.
2. Reject absent, stale, wrong-source and tampered deletion checkpoints. A separate manifest created after the backup represents deletion records retained outside that backup. Its independently held expected digest, source and sequence prevent accidental mismatch in this fixture; they are not a production signing or completeness guarantee.
3. Inject a failure after applying deletion cleanup and session invalidation. Confirm the transaction rolls back and the candidate remains ineligible for release.
4. Merge the retained deletion subjects with tombstones already present in the snapshot. Purge blocked subjects' followups, quotes, customers, idempotency records, subscriptions and account rows. Retain the tombstones. Invalidate all simulated restored provider sessions. Repeat the reconciliation to check idempotence.
5. Confirm old sessions from both accounts are rejected after reconciliation.
6. Simulate fresh sessions: the deleted account cannot provision itself or write again; the surviving account retains its records and idempotent retry behavior.
7. Confirm restored RLS and private-table permissions remain intact. Mark the isolated candidate verified only after every check passes, then drop the generated databases and roles.

## Run and evidence

The existing Native PostgreSQL concurrency gate runs this drill once per engine after its three repetitions of the concurrency suite. Local syntax and six configuration/manifest guards pass. The runner's no-configuration invocation correctly exits 2 before any connection. Native archive/restore results must be taken from the CI run, not inferred from those guard tests.

The fixture models provider sessions with `tests/postgres/bootstrap.sql`. Its direct SQL deletion from that simulated auth.sessions table is **not a production Supabase operational procedure**. Real provider session revocation, key rotation as appropriate, browser reauthentication, Auth ownership/grants and application cutover require a separately reviewed managed-provider procedure.

## Production work still open

- An authoritative, durable deletion log outside the backup/restore failure domain, with controlled writers, independently verified completeness/checkpoints, access restrictions and an agreed retention policy. The hosted in-database tombstones alone cannot supply post-snapshot deletions after that database is lost.
- A durable record of each deletion before reporting deletion complete; retries, ordering and recovery from failure to persist that record.
- Actual backup availability, retention, restore target and operator responsibilities for the user's Supabase plan. No paid backup service or extra project was provisioned by this drill.
- Managed Auth/session reconciliation and a maintenance boundary that prevents **both** Worker and direct Data API access until validation finishes. Disabling only the Worker does not protect direct PostgREST access.
- Restore rehearsals for storage objects, external payment/provider state, secrets and migration-history alignment where those resources are used. A database archive is not an all-services backup.
- Recovery-time and recovery-point objectives, encrypted off-site storage, operational rollback and an actual controlled hosted restore rehearsal.

Passing this test establishes the reconciliation mechanics in a disposable PostgreSQL environment. It does not establish production disaster-recovery readiness or authorize restoring the live project.

References: [PostgreSQL pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html), [Supabase backup/restore guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
