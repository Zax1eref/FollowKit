# Disposable quote and followup isolation — 27 October 2026

User-supplied results: read isolation passed 36/36; customer write isolation passed 32/32 with both temporary customers removed. This runner is the next step. Its live execution is pending, not established by fixture tests.

## Prepare

Use the same two confirmed synthetic accounts and existing read-test fixtures. Each account needs one free pending-quote slot. Do not close or delete real quotes to free a slot. The runner creates one marked customer, one pending quote worth 1 satang (then changes it to 2 satang), and one followup per account. These synthetic rows temporarily affect dashboard totals. Do not edit the test rows while it is running.

The run confirms owner edits and followups work, then tests foreign quote PATCH/DELETE and followup creation via Worker and RPC, direct quote table PATCH/DELETE, and direct followup table INSERT/PATCH/DELETE. All eleven probes run in both directions. After every denial, the owner's full quote and history must match their baseline. Unrelated server errors do not count as successful denials. This does not cover every legacy RPC, owner injection, quota races or all possible write paths.

Cleanup deletes each run-created quote, verifies that its followup rows are gone, then deletes its marked customer. It does not touch existing user records. Quote-creation idempotency entries remain in the private request_dedup table: `cleanupComplete` refers to the customer/quote/followup rows, not erasure of all database metadata. No privileged credentials are used to purge metadata.

## Run on your own computer

Run `git pull --ff-only` in the FollowKit checkout, then use Node 22+ and this PowerShell block. Enter current test-user access tokens at the hidden prompts, without quotes. Never paste tokens into chat. The final block removes token environment variables even if the run fails.

```powershell
try {
  $a = Read-Host 'Test account A access token' -AsSecureString
  $b = Read-Host 'Test account B access token' -AsSecureString
  $env:FOLLOWKIT_TEST_TOKEN_A = [System.Net.NetworkCredential]::new('', $a).Password
  $env:FOLLOWKIT_TEST_TOKEN_B = [System.Net.NetworkCredential]::new('', $b).Password
  node scripts/live-quote-isolation.mjs --disposable-test-accounts
} finally {
  Remove-Item Env:FOLLOWKIT_TEST_TOKEN_A -ErrorAction SilentlyContinue
  Remove-Item Env:FOLLOWKIT_TEST_TOKEN_B -ErrorAction SilentlyContinue
  Remove-Variable a,b -ErrorAction SilentlyContinue
}
```

Expected: `passed: true`, 58 passing checks (the 36 read checks are aggregated into one preflight check), and `cleanupComplete: true`. Both cleanup entries must have quoteRemoved, historyRemoved and customerRemoved true. Share only the sanitized JSON output. Close the terminal afterward.

If preflight fails, `preflightFailure` now includes the sanitized nested report so another diagnostic run is unnecessary. Missing/expired tokens, quota rejection, service failure and cleanup failure all prevent a pass. Transport errors are not automatically retried, especially after writes. If `manualCleanupMarker` appears, locate only that marked synthetic quote/customer in the UI, remove the quote first and then the customer. Resolve leftover rows before another run. A failed probe may indicate a vulnerability or an operational problem; it is not by itself proof of either.

Regression coverage: successful two-way checks and cleanup; no writes without acknowledgement/preflight; detection of simulated patch/delete/followup bypasses; unrelated-error rejection; quota failure cleanup; ambiguous create without retries; failed cleanup preventing success. These fixture checks do not substitute for your live result.
