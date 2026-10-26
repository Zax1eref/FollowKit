# Deployment guide — preparation only
Current output is local-only prototype. No deploy command has been run; no public URL exists.
1. Download/extract project, Node 22+, run npm test and npm run build. Open dist/index.html locally.
2. Review prototype with fictitious data; resolve demand gate before full build.
3. For a private hosted static demo: confirm audience and register a Site; sync source; package dist through Sites helper; deploy privately; verify returned URL and no data collection. No guessed project IDs.
4. For real beta: implement managed auth, API, Postgres/RLS migration, privacy/contact handling, enforce entitlements; pass auth/reset, cross-user, abuse/error, backup restore, browser tests.
5. Confirm free tier commercial terms and spending cap; obtain owner approval for public real-data deployment per master prompt section 2. Store secrets in hosting secret manager, never browser code.
6. Deploy staging then smoke test exact deployed URL with authorized test users; record version and rollback target.
7. Payment live gate is separate: approve provider/costs/KYC, verify signed webhook/replay/concurrency/cancel/failure, approve live payments.
