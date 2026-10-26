# Measure access-token behavior after logout — 27 October 2026

Previous user-supplied live results: read isolation 36/36, disposable customer writes 32/32 and quote/followup writes 58/58, with application-row cleanup complete. This next measurement is pending live execution.

This runner uses **one synthetic test account**. It verifies provider identity and successful owner reads through Worker and direct PostgREST, sends the same provider global-logout request used by FollowKit, then replays that original access token. Global logout affects **all sessions/devices for this one account**. No customer, quote, followup, schema or Auth configuration is changed. No refresh token is requested or used.

Supabase documents that an access JWT can remain valid until expiry after signout. Consequently this runner measures access rather than treating every successful logout response as immediate revocation. If either endpoint still permits a read, `--wait-until-expiry` waits locally until the JWT's expiry plus 65 seconds, then samples both endpoints once more. The 65 seconds are this test's observation buffer, not a guaranteed provider clock allowance. There is no repeated network polling while waiting. Time remaining is printed every 30 seconds; keep the terminal and computer awake. Accepted tokens must have 30 seconds to two hours remaining initially.

## Run

1. Run `git pull --ff-only` in the FollowKit checkout (Node 22+).
2. Sign into one confirmed synthetic test account that already has an application account. Copy its current access token locally, then close its FollowKit tabs to avoid background refresh during measurement. Do not log out manually before the run; the runner needs a valid before-logout control.
3. Run the following PowerShell block. Paste the token at the hidden prompt **without quotes**. This is the only token required. The explicit flag authorizes global logout for that test account.

```powershell
try {
  $a = Read-Host 'Test account access token (this account will be logged out)' -AsSecureString
  $env:FOLLOWKIT_TEST_TOKEN_A = [System.Net.NetworkCredential]::new('', $a).Password
  node scripts/live-logout.mjs --logout-test-account --wait-until-expiry
} finally {
  Remove-Item Env:FOLLOWKIT_TEST_TOKEN_A -ErrorAction SilentlyContinue
  Remove-Variable a -ErrorAction SilentlyContinue
}
```

Do not send tokens, passwords or browser storage to chat. Share only the final sanitized JSON report, not the progress lines. Afterward the test account may need to sign in again. The direct HTTP logout does not remove browser localStorage or emit SDK events; browser UI clearing is outside this measurement.

## Interpret results

- `measurementComplete: true`: the requested observations completed; not a blanket security pass.
- `logoutAccepted: true`: provider returned 204 to the global logout request.
- `immediateRevocation: true`: both tested endpoints denied the first post-logout sample. This is a sampled observation, not proof of zero-delay revocation.
- `immediateRevocation: false`: at least one tested endpoint still accepted the old token at that sample. Consult each endpoint's result.
- `expiryCheckPerformed: true`: the later sample was performed after expiry plus the observation buffer.
- `rejectionObserved: true`: both endpoints denied the last sample. `rejectionObservedBySeconds` is elapsed time to completing that sample; it does not reveal the exact moment access stopped or prove continuous denial.
- `measurementComplete: false`: invalid/expired input, failed positive controls, unconfirmed logout, unexpected response or transport error. A 429/5xx/empty row response is inconclusive, not revocation proof.

Exit 0 requires a complete measurement with both endpoints denied at the final sample; other outcomes exit 2. Without `--wait-until-expiry`, only the initial post-logout sample is collected and no expiry bound is claimed. If access persists at the expiry check, report it for investigation; do not silently rerun or change token settings. Sample timestamps reflect the computer's clock, so keep automatic clock synchronization enabled.

Coverage is limited to two owner-read endpoints and one original JWT. Refresh-token revocation, every RPC, UI storage clearing and exact revocation timing are not established by this script. Public-beta acceptance remains a separate decision.

References consulted: https://supabase.com/docs/guides/auth/sessions and https://supabase.com/docs/reference/javascript/auth-signout. The pinned local auth-js implementation sends POST `/auth/v1/logout?scope=global`; no admin/service key is needed for the user's own logout.
