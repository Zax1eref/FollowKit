# Independent deletion archive preparation — 27 October 2026

Status: adapter implemented and tested locally; remote R2 subscription/bucket not confirmed or provisioned. The user reported R2 is not enabled or they are unsure. No billing, account configuration, live binding, deletion API, external tombstone upload or live database change occurred.

## Implemented boundary

`src/server/deletion-archive.mjs` provides an operator-side `deletionArchive({bucket, source}).retain(subject)` building block. It is not imported into the public Worker. Its caller must authenticate/authorize deletion and derive the owner from trusted identity; this module is not an authorization endpoint.

The object key is `tombstones/v1/<source>/<subject UUID>.json`; its canonical body contains version, source, subject and `action: deny_restore` only. No email, name, customer data, session or token is included. UUIDs remain sensitive operational identifiers and belong only in private storage.

The adapter reads an existing marker or conditionally creates it with `etagDoesNotMatch: '*'`. It never overwrites or deletes an object. It acknowledges retention only after exact-byte readback. A lost write acknowledgement is resolved by readback, conflicting data fails closed, provider errors are sanitized, and reads are bounded to 4 KiB. A timeout does not cancel an in-flight R2 binding operation; callers must keep deletion blocked/pending and retry the same marker to resolve an uncertain outcome.

The application must not report deletion complete or purge its only authoritative record before durable archive acknowledgement. A retained deny marker is conservative and must not be written merely because a user opened/canceled a confirmation dialog. Full deletion orchestration, authorized operator access and retry scheduling are still pending.

## Verification completed

- Node suite: 145/145, including five new archive groups.
- Real local Miniflare R2 binding: eight simultaneous conditional creates converged to one object; an attempted overwrite was rejected; conflicting bytes failed closed; repeat retention succeeded.
- No remote R2 request, secret key or live account identifier was used. Local R2 emulation does not prove remote durability, retention locks or access permissions.

Reproduce with `npm test` and `node tools/worker/deletion-archive-test.mjs` after installing the existing locked worker tool dependencies. No new dependency was added.

## Proposed hosted setup, not yet executed

1. In the existing Cloudflare account, inspect **Storage & databases → R2 → Overview**. Cloudflare documents an R2 subscription checkout and usage-based monthly billing with included free usage. The user should review the displayed terms before enabling it; no zero-cost guarantee is implied.
2. Once enabled and authorized, create a dedicated private Standard bucket such as `followkit-deletion-ledger`. Keep public development URLs and custom-domain access disabled. Do not reuse the public application's assets bucket.
3. Bind it only to a separate restricted operator/deletion service. Do not expose bucket listing, downloads or arbitrary-subject writes through the current public Worker. Prefer a platform binding over copying API credentials into code or chat.
4. Establish a retention period covering every restorable backup and retained copy before setting bucket-lock rules. Do not enable lifecycle expiration for retained markers while any backup could restore those subjects. Bucket locks protect against overwrite/deletion but are not a complete independent integrity/completeness protocol; privileged configuration access still matters.
5. Run a synthetic remote write/readback and access-control test. Then implement the authorized deletion state machine and prove that archive outages cannot produce a false completed-deletion result.
6. Implement a frozen-writer or separately sequenced export/checkpoint process for restore reconciliation. Paginated object listing alone does not establish a complete point-in-time deletion authority. The earlier restore drill's fixture manifest is not yet connected to this adapter.

R2 separates this archive from a Supabase database restore, but sharing Cloudflare administration with the Worker remains an account-level failure dependency. Operator access, independent checkpoint custody and additional off-site retention must be decided for the intended recovery guarantees. No indefinite or legally mandated retention period has been assumed.

A plugin-directory search found no Cloudflare/R2 connector in this session. That does not prove no integration exists elsewhere; setup currently needs the user's Cloudflare dashboard or an explicitly connected supported tool. No credentials should be pasted into chat.

References checked: [R2 setup](https://developers.cloudflare.com/r2/get-started/), [Workers binding and conditional API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/), [bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/), [pricing](https://developers.cloudflare.com/r2/pricing/).
