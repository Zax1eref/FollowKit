# Reliability QA — 24 October 2026
Automated: npm test 39 passed, 0 failed. Build passed. Full output at root test-results.txt/build-results.txt.
New tests: durable quote replay after database reopen; payload mismatch; owner scope; missing key; 501 customers and 501 closed quotes paginated completely; invalid cursors/limits; limiter isolation, expiry/cap and API 429 Retry-After.
Browser internal preview, synthetic A: edited customer QA-A name to ลูกค้า QA-A แก้ไข and contact qa@example.com; saved list updated. Attempted deletion with linked quote: visible Thai refusal; customer remained. Reloaded page and reopened customer manager: edited name/contact persisted.
No successful unlinked-customer deletion browser check in this round. Earlier quote CRUD/A-B/persistence/offline evidence retained in qa-integration.md. No physical-mobile/full accessibility claim.
Fixed clearApiView to empty an open customer manager and hide edit form when account data clears, avoiding stale customer display on load failure.
Limits: no actual auth/deploy/payment; per-process limiter only; UI fetches all pages; no concurrency snapshot; browser dedup key is not persisted across reload; no dedup retention cleanup yet.
