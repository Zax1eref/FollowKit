# Account export and local database recovery
Test-only runtime, synthetic data. No production backup service or schedule is configured.

## Export one account
In connected test mode, select A or B and use “ส่งออกข้อมูลบัญชี (JSON)”.
GET /api/account/export uses the authenticated server identity, never a supplied account ID. Anonymous requests return 401. The response is a no-store JSON attachment.
Version 1 contains format, version, exported_at, account, customers, quotes, followups, subscriptions. Money remains integer satang; dates remain ISO. Followup note retains its existing JSON-string representation. IDs preserve relationships. One transaction produces a consistent account snapshot, without the old 500-row cap.
The export deliberately excludes request-dedup internals and global payment events; it is a portable data extract, not a restorable full database backup. No JSON import feature exists. Full export is in memory and holds a short database transaction: large-account streaming/jobs and dedicated export throttling remain future work.

## Operator backup and restore
These are local CLI operations, never HTTP routes. Use only trusted backups from this same schema version. Run from the extracted followkit directory:

```sh
node scripts/database.mjs backup .local/test.sqlite .local/backup-001.sqlite
node scripts/database.mjs verify .local/backup-001.sqlite
node scripts/database.mjs restore .local/backup-001.sqlite .local/restored-001.sqlite
node scripts/database.mjs verify .local/restored-001.sqlite
```
The destination's parent directory must already exist. Every destination must be new: an existing file, symlink or same-path target is rejected. A failed verification does not publish a destination.
VACUUM INTO creates a consistent snapshot including committed WAL data, excluding uncommitted writes. Do not copy only the live SQLite main file manually. Validation checks SQLite integrity, foreign keys and exact application schema; snapshots retain all seven tables, including both accounts, subscriptions, payment events and durable retry responses. The staged file is published with an exclusive hard link on the same filesystem and permissions 0600; the private staging directory is cleaned up. This is not a power-loss durability or adversarial-file security guarantee.
Restore writes a separate database. Verify it before cutover. This command does not stop the server, switch the active database, or overwrite .local/test.sqlite. A real cutover needs a planned stop, preserved rollback copy and explicit database path selection; the development server currently uses .local/test.sqlite.
Keep original source and verified backup until rollback is no longer needed. No automatic deletion/rotation. Never commit or package exports or backup databases: keep them under .local/. Full snapshots include every account and must stay operator-only.

## Verified and outstanding
46 automated tests cover owner isolation, 502 customers + 502 quotes in export, linked followups/subscriptions, anonymous rejection, WAL snapshot consistency, all-table restore, durable retry replay, overwrite refusal, corrupt/foreign-key-invalid/schema-mismatched rejection.
CLI backup → restore → verify also passed using existing synthetic runtime data (2 accounts, 1 customer, 1 quote, 1 followup).
Browser download interaction was not retested in this increment; endpoint behavior and attachment headers were tested. The standalone HTML has no server/export feature.
No encrypted remote backup, retention schedule, account deletion, large-data load test, production restore drill, provider identity, or production deployment is claimed.
