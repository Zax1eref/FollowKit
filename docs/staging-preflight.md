# Offline staging configuration preflight

Prepared 26 October 2026. This is a plan checker, not a deployment tool or a provider-settings inspector. It neither reads environment secrets nor fetches network resources. No existing Worker configuration is edited.

## Input and use

Copy `config/staging-plan.example.json` into an ignored local file such as `.local/staging-plan.json`. Fill only the proposed publishable bindings and the settings you intend to verify in the provider console. Do not enter admin/service-role keys, passwords or access tokens. The committed template is disabled and intentionally incomplete, so checking it must fail.

```sh
node scripts/staging-preflight.mjs < config/staging-plan.example.json
# Expected exit 2: incomplete example, configurationValid=false.
node scripts/staging-preflight.mjs < .local/staging-plan.json
```

For a candidate plan, `bindings` must contain exactly the four documented string bindings. Set `FOLLOWKIT_API_ENABLED` to `true` in this private plan only when checking the proposed enabled configuration; the checker never changes `wrangler.jsonc`. The app/provider must have distinct HTTPS origins with no credentials, path, query or fragment. The key must use the publishable format accepted by the Worker.

`provider.emailConfirmationRequired` must be true and `anonymousSignInEnabled` false. `redirectUrls` must contain exactly the app origin plus `/auth/callback` and `/auth/recovery`, without wildcard, duplicate or additional entries. This strict allowlist is scoped to this staging app.

`worker` must keep workers.dev/preview URLs disabled and bind `auth-dist` as ASSETS with `run_worker_first:true` and `html_handling:none`. These checks do not verify route ownership, account/project IDs or that files have been uploaded.

## Results and limits

Exit 0 means the submitted configuration is structurally consistent; exit 2 means rejected/incomplete input. Input is limited to 64 KiB. Output contains static error codes and pending gate names, not submitted values. Never interpret exit 0 as permission to deploy: `releaseReady` is always false in this offline tool. Operator-provided provider booleans are assertions only; independently verify the actual console settings and behavior during staging acceptance.

Pending gates: native multi-connection PostgreSQL; actual signup/recovery lifecycle; direct RLS isolation; access-token revocation bound; deletion/restore reconciliation; physical-device/accessibility checks; approved target and budget. See `staging-validation.md`. Native CI now also runs the seven preflight tests before its database scenarios, but that workflow has not been pushed or dispatched.

## Evidence

`npm test` passes 113/113, including seven preflight groups. They cover valid fixture configuration without release readiness, actual Worker rejection, callback allowlist errors, auth/asset settings, unknown bindings/invalid shapes, CLI credential-safe rejection of malformed/oversized stdin and origin normalization. `project/staging-preflight-results.txt` records the deliberately incomplete template rejection. No real provider settings were supplied or validated.
