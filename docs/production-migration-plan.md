# Production migration and acceptance plan
24 October 2026 — execution order for ADR-014. Update 25 October: step 1 SQL is implemented and tested in PostgreSQL WASM (14 groups). Native multi-connection/Supabase validation remains pending. Async API/HTTP adapter and migration 003 are also implemented under mocked transport tests (66 Node, 18 PGlite groups). No real provider connection. Steps below describe the full production path.

## Schema mapping
| Local table/field | PostgreSQL target | Required boundary |
|---|---|---|
| accounts.id text (test-A/B) | UUID tied to auth.users, lifecycle state | Never migrate fixture identities; no client plan updates |
| customers | UUID id/owner, bounded text/contact | Owner SELECT; writes only via controlled routes/functions |
| quotes | UUID FKs, bigint satang, date fields | Composite customer+owner FK, valid status/date/amount, transactional quota |
| followup_events | UUID event ID, timestamptz, structured note/next_due + retry key | Unique owner/quote/retry key; owner scope and quote FK |
| subscriptions | Owner UUID, provider state/reference | Read-own; trusted billing writes only |
| payment_events | Provider/event unique key + minimal reconciliation references | Private schema; no client grants |
| request_dedup | Owner/scope/key unique, jsonb request/response, timestamptz | Private/internal storage; purge on deletion; retention decision needed |
| new deletion ledger | Minimal subject identifier, request/state/timestamps | Private access; restore reconciliation; no customer contact content |

Keep local SQLite migrations unchanged. Create a separate production migration tree; never run PostgreSQL SQL in the local harness. Use new synthetic UUID identities in a separate test project/local provider environment. Do not upload .local/test.sqlite, JSON exports or existing backup files.

## Ordered implementation
1. Author PostgreSQL schema, grants, RLS and transactional functions in a disposable local PostgreSQL/Supabase environment. Review direct table grants and security-definer functions. Record actual execution evidence; SQLite tests are insufficient.
2. Replace synchronous Store dependency with an async repository interface; await every API operation. Add HTTP/PostgREST adapter with user-token propagation and bounded timeouts; preserve domain rules/error envelopes. Retest local adapter after interface migration.
3. Build standalone Worker entry and static frontend packaging. Exclude test-harness/dev/recovery scripts and node:sqlite from the production bundle. Keep /__test/* absent, not hidden behind UI.
4. Configure managed auth in an isolated test environment through approved account access. Verify signup/confirmation/reset, same-origin return paths, refresh rotation, concurrent tabs, expiry and revocation. No secrets in chat or source.
5. Add live-session/deleting-account enforcement, export limits, distributed abuse controls and deletion orchestration. Prove behavior through direct data API access, not only BFF tests.
6. Restore/reconciliation drill, privacy/retention text, monitoring redaction and budget/plan review. Prepare exact deployment artifact, access audience and expected costs for final approval. No public deploy before this review and required authorization.

## Acceptance matrix (all PENDING on real provider/Postgres)
| ID | Scenario | Pass condition |
|---|---|---|
| AUTH-1 | Signup/verify/login | Unverified identities cannot access records; valid verified login succeeds |
| AUTH-2 | Reset links | Wrong, expired and reused links rejected; valid reset succeeds without account enumeration |
| AUTH-3 | Logout/token replay | Old session denied through Worker and direct data API according to explicit revocation policy |
| AUTH-4 | Refresh/concurrent tabs | No cross-user leakage, stale-cookie overwrite or uncontrolled refresh retry |
| TENANT-1 | A/B/anonymous CRUD and export | Foreign IDs/owner injection denied; no B data in A export |
| TENANT-2 | Direct data API/RPC | Same isolation/quota/plan protection as Worker; grants cannot bypass rules |
| QUOTA-1 | Concurrent create/reopen | Exactly allowed pending count commits; failures leave no orphan customer |
| RETRY-1 | Lost response/restart | Same owner/scope/key replays once; changed payload conflicts |
| DELETE-1 | Provider deletion fails partway | Account remains denied, retry completes, no resurrection from token |
| RESTORE-1 | Restore snapshot predating deletion | Ledger reapplied before service opens; deleted subject cannot log in/read |
| EDGE-1 | Worker bundle/runtime | No SQLite/test routes; missing auth/config fails closed; safe logs/errors |
| OPS-1 | Backup/budget/notice | Restore verified; actual cost/limits documented; notice/controller/retention reviewed |

Prerequisites for provider tests: owner-controlled Supabase and Cloudflare test access, allowed callback origin, test email inbox, approved service plan/region. Missing prerequisites do not block local SQL/interface preparation. No external messaging, paid service, project provisioning or publishing is authorized merely by this plan.
