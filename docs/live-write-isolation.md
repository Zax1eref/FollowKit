# Disposable customer write isolation — 27 October 2026

The user supplied a successful 36/36 read-only two-account HTTP report. This next runner tests customer modification/deletion only. Its live execution is pending; fixture tests are not live evidence. Quote/followup writes, owner injection, quotas, and billing remain outside this step.

Use the same two synthetic test accounts and prerequisites from `live-isolation.md`. Do not use accounts holding real customer information. The runner rechecks all 36 read-only assertions before making changes. It then creates one uniquely marked customer per account, confirms each owner can edit their new customer, and attempts foreign PATCH/DELETE through the Worker, direct customer RPCs, and direct table endpoints. It verifies unchanged data after each denied operation. Only the two newly created customer IDs are ever mutation targets. No quotes, subscriptions, Auth records or settings are modified.

Expected output: `passed: true`, 32 passing checks (including the read-preflight aggregate), two cleanup entries with `removed: true`, and `cleanupComplete: true`. Denial checks require the expected ownership/permission error rather than accepting arbitrary failures. Cleanup uses the original owning session, checks the unique run marker and owner again, and confirms removal. No write is retried automatically. If creation times out after committing or cleanup fails, `manualCleanupMarker` identifies the synthetic customer name to remove through the normal UI. Do not delete unrelated customers. An uncertain outcome fails the run.

Update your local checkout with `git pull --ff-only` first. Use Node 22+. In PowerShell, run the block below from the FollowKit directory. At each hidden prompt, paste only the test user's current **access token**, without quotes. Never paste it into chat or a shell command; never use a refresh token or service key.

```powershell
try {
  $a = Read-Host 'Test account A access token' -AsSecureString
  $b = Read-Host 'Test account B access token' -AsSecureString
  $env:FOLLOWKIT_TEST_TOKEN_A = [System.Net.NetworkCredential]::new('', $a).Password
  $env:FOLLOWKIT_TEST_TOKEN_B = [System.Net.NetworkCredential]::new('', $b).Password
  node scripts/live-write-isolation.mjs --disposable-test-accounts
} finally {
  Remove-Item Env:FOLLOWKIT_TEST_TOKEN_A -ErrorAction SilentlyContinue
  Remove-Item Env:FOLLOWKIT_TEST_TOKEN_B -ErrorAction SilentlyContinue
  Remove-Variable a,b -ErrorAction SilentlyContinue
}
```

The flag acknowledges that these are disposable test accounts and allows the two temporary customer creates/edits/deletes. Without it the runner sends no requests. Tokens remain local to the process and are sent only to the two pinned reviewed origins. JSON output contains check names and cleanup status, never tokens, customer records or account IDs. Share only this JSON report. Close the terminal afterward.

Regression coverage: successful isolation/cleanup; no writes without confirmation or passing read controls; detection of an ownership bypass; arbitrary-error rejection; lost create response without retry; cleanup failure preventing a pass.
