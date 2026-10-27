# Archive-gated deletion coordinator — 27 October 2026

Status: internal coordinator implemented and tested, NOT installed in the public Worker. No live deletion, Auth action, database migration or billing action occurred. The user supplied a passing remote_archive_storage_probe result (retained and retryVerified true; productionDeletionWritten false). That validates the diagnostic path, not full account erasure.

`src/server/deletion-workflow.mjs` runs an already-confirmed durable job by job UUID. It obtains its owner only from `jobs.loadConfirmed`, then requires exact `retained: true` from the existing archive interface before any destructive effect. It executes blockAccess, revokeSessions, settleBilling, purgeData, removeIdentity and complete in that order, requiring `done: true` each time. Exceptions or missing acknowledgements return pending with the failed stage, without provider messages or identifiers. A retry repeats all steps, including archive readback; it never treats a previous uncertain response as success.

This is a coordinator contract, not a durable queue implementation. Production adapters are deliberately absent, and mock tests cannot prove provider idempotency. Required adapter guarantees before activation:

- Job admission authenticates the user, recent-auth requirement, same-origin/CSRF protection as applicable, exact confirmation and trusted owner derivation. Persist the irreversible confirmed request before running any archive write. Canceled dialogs never create jobs. Serialize/deduplicate jobs per owner and provide bounded retries/timeouts and recovery after process death.
- `loadConfirmed` rejects unconfirmed jobs and cannot change a job's owner. Confirmed jobs cannot be canceled after irreversible archive work begins. No browser-supplied owner is accepted by the coordinator.
- `blockAccess` durably marks deleting/tombstoned under the same account lock used for writes, preventing provisioning and draining/serializing in-flight mutations. Archive failure keeps the job pending without claiming deletion, even if an upstream admission process already blocked access.
- Billing reconciliation must positively establish no subscription or finish required cancellation; unknown state is pending, not assumed absent. Preserve required operational evidence without copying personal payloads.
- `revokeSessions` must establish provider session revocation before billing/purge. On retries after identity removal it must positively verify absence rather than assume an error means success. The retained tombstone remains the application access barrier.
- Identity removal must use the supported provider administrative mechanism and establish the postcondition on retry. A generic error is never proof of absence. Never directly manipulate managed Auth internals through this coordinator.
- Data purge must be transactional and scoped to the owner, retain deletion authority and durable job records independently of removed account rows, and handle foreign keys/provider ordering in the concrete schema.
- Each effect must be safely repeatable, including concurrent workers and lost responses. `complete` independently verifies durable postconditions before committing completion. A true returned flag is not a substitute for this adapter responsibility.

The tests cover archive outage, malformed acknowledgement, absent/unconfirmed/mismatched jobs, failures at every step, retries after uncertain provider outcome and false completion acknowledgements. `npm test`: 151/151 pass. No claim of remote end-to-end deletion is made. Production job storage, provider/billing adapters, actual purge transactions, retry worker, restore checkpoint completeness and retention policy remain required. No deployment is needed for this internal-only change.

## Foreign-key-safe order verified

The coordinator now requires revokeSessions explicitly and executes app purge before final identity removal. The un-applied queue migration accepts the new failure stage. No production adapter is supplied by this change.

`node tests/postgres/deletion-order.mjs` runs three groups against actual PostgreSQL WASM constraints using synthetic provider tables: the old order fails its Auth foreign key; injected purge failure rolls back app rows without calling identity removal; provider failure after purge stays pending and retry completes while the tombstone/job and another account survive. Session revocation and identity deletion use mock Auth tables only, not a recommended production SQL operation. Billing/archive responses are mocked in this test, and the minimal fixture covers accounts/customers rather than a complete production purge. Existing queue tests (three groups) and Node suite (151/151) also pass.

Before activation, implement supported provider adapters, full owner-scoped purge with all application tables, lease fencing/renewal, final-state verification and native multi-connection tests. User confirmation/admission and retention/restore completeness remain required. This source update needs no user deployment.
