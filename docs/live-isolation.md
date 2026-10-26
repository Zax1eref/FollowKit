# Read-only two-account HTTP isolation check

Status: runner tested with fixtures; live authenticated run is pending two approved test sessions. This is not a passing live security gate.

Run `node scripts/live-isolation.mjs` with Node 22+ from a trusted local checkout. Set `FOLLOWKIT_TEST_TOKEN_A` and `FOLLOWKIT_TEST_TOKEN_B` to current access tokens from two distinct confirmed test-user sessions. Never use refresh tokens, service-role tokens, or secret keys. Never paste credentials into chat, GitHub, shell commands/history, screenshots, or result reports.

Use synthetic test accounts only. Each account must already have an active application account, a subscription, at least one customer, one quote and one followup. Create these through the normal UI. Missing fixtures cause failure rather than a misleading pass. The runner creates nothing and sends no email.

The targets are pinned to the reviewed FollowKit Worker and Supabase project. The runner verifies identities with the provider, confirms own-account reads succeed, checks all five public tables for foreign-owner rows directly through PostgREST, then attempts foreign customer, quote and history reads through the Worker. It checks both directions, issues only GET requests, rejects redirects, bounds response size/time, and never logs tokens, account IDs, names, or response bodies.

On Windows PowerShell, enter each access token at the masked prompt on your own computer (not into chat):

```powershell
try {
  $a = Read-Host 'Test account A access token' -AsSecureString
  $b = Read-Host 'Test account B access token' -AsSecureString
  $env:FOLLOWKIT_TEST_TOKEN_A = [System.Net.NetworkCredential]::new('', $a).Password
  $env:FOLLOWKIT_TEST_TOKEN_B = [System.Net.NetworkCredential]::new('', $b).Password
  node scripts/live-isolation.mjs
} finally {
  Remove-Item Env:FOLLOWKIT_TEST_TOKEN_A -ErrorAction SilentlyContinue
  Remove-Item Env:FOLLOWKIT_TEST_TOKEN_B -ErrorAction SilentlyContinue
  Remove-Variable a,b -ErrorAction SilentlyContinue
}
```

Use access tokens only from your own approved test sessions, obtained locally through your browser's application storage inspection. Do not export the full storage/session object. The program removes its inherited token environment variables before network requests; secrets remain briefly in process memory while used. Close the terminal after the check.

Exit 0 and `passed: true` require all 36 checks to pass. Exit 2 means a failed assertion, missing/expired session, missing fixture, configuration mismatch, or transport failure. `stoppedAt` identifies the phase without printing provider errors. Do not treat an operational failure as proof of a vulnerability or as a pass. Share only the generated sanitized JSON if investigation is needed.

Limitations: this checks read isolation for the two accounts and sampled Worker records. It does not test write/RPC isolation, quotas, every pagination path, token revocation, recovery links, or operational backup/restore. Do not run mutation probes against real customer records.

Reference: https://supabase.com/docs/guides/api/securing-your-api (consulted 27 October 2026).
