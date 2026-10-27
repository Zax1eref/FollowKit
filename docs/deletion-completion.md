# Verified deletion completion — 27 October 2026

Candidate migration and server adapter only; no hosted schema change, Auth action or deployment. Requires prior queue/purge candidate migrations. No additional browser or service role privileges are granted.

complete_deletion_job(job,subject,token) runs as SECURITY INVOKER with empty search_path. It locks the job, verifies subject and execution lease, takes the provisioning advisory lock and checks archive/session/billing/purge evidence, retained tombstone, absence of managed Auth users/sessions, and absence from every current owner-linked app table. It reads Auth only. On success it atomically stores completion time and the finishing lease token, clears the active lease/failure, and leaves the record immutable. Retries from that same finishing token recheck postconditions and acknowledge without updating the record; different tokens/owners fail.

The server-only deletionCompletion adapter uses a parameterized query and returns done only on a strict boolean result. Use a primary autocommit connection with bounded timeouts: returning from an uncommitted outer transaction is not evidence of completion. Snapshot checks do not prevent privileged future restoration or manual data insertion; retries detect inconsistent restored identity state. Restore reconciliation and retention remain independent obligations.

Embedded PostgreSQL tests cover Auth still present, client denial, wrong/expired lease, wrong owner, each missing evidence timestamp, repeated acknowledgement, inability to reclaim/reopen a completed job, and rejection if identity is recreated. Six combined purge/session/readiness/completion groups pass. Native PostgreSQL 17/18 CI includes simultaneous completion calls on two connections and verifies the Auth-presence guard, with mocked provider tables only.

No real account deletion or live provider validation occurred. The coordinator's jobs.complete can use this adapter; durable job admission, evidence writers, billing integration, lease renewal, private service wiring and hosted review are still required. Do not run db push against the repository's mixed historical migration layout.
