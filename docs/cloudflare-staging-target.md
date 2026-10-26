# FollowKit staging deployment target

Prepared 26 October 2026. Target: https://followkit.hakimihaika219.workers.dev/auth/ . Worker name: followkit. This setup is prepared, not deployed or verified live. Publishing the staging configuration exposes the login UI on workers.dev; do not enter real customer data during acceptance tests.

## Supabase Auth settings to apply in the dashboard

Site URL: `https://followkit.hakimihaika219.workers.dev/auth/`

Exact additional Redirect URLs:

- `https://followkit.hakimihaika219.workers.dev/auth/callback`
- `https://followkit.hakimihaika219.workers.dev/auth/recovery`

Keep email confirmation enabled and anonymous sign-in disabled. These are intended settings, not a claim that the remote Auth configuration was changed. The available Supabase connector cannot edit these settings. No signup/reset emails have been sent.

## Cloudflare Workers Builds

Connect the existing Worker **followkit** to **Zax1eref/FollowKit**, branch **main**, repository root. Use Node 24. Set:

Build command:

```sh
npm ci --prefix tools/auth && npm --prefix tools/auth run build && npm ci --prefix tools/worker && npm --prefix tools/worker run build && npm test && node scripts/staging-preflight.mjs < config/staging-plan.followkit.json
```

Deploy command:

```sh
npx --yes wrangler@4.152.0 deploy --config wrangler.staging.jsonc
```

Use this explicit config; the default wrangler.jsonc remains disabled and has a different candidate Worker name. The preflight output verifies the proposed settings only. releaseReady remains false until live acceptance checks pass. Its pendingGates list is a generic checklist, not a live project status query; the native database gate already passed separately on PostgreSQL 17/18.

Only the project URL and modern publishable key are present in this configuration; no service-role/admin key or Cloudflare token is committed. Preview URLs stay disabled. workers.dev is enabled because the user selected it as the primary origin. The checker rejects enabling workers.dev as an alternate alias for a custom domain or mismatching the Worker name.

The UI entry is `/auth/`; the root `/` is not an application route. After the operator deploys, verify `/auth/` and `/auth/config`, then conduct signup/recovery and two-user Worker/direct-RLS acceptance. Never treat the deployed UI alone as a completed live-auth test.

## Validation

Node suite passes 115/115, including two new primary-workers.dev routing cases. The target preflight passes with releaseReady=false. Wrangler 4.152.0 dry-run successfully prepared the Worker and read six asset files; see project/staging-dry-run-results.txt. No Cloudflare deployment was invoked.

## Rollback

Set FOLLOWKIT_API_ENABLED to false in wrangler.staging.jsonc and redeploy with the same explicit config and Worker name. This disables the app/API without deleting database records. Do not deploy the default config as a rollback: it addresses a different Worker.

References: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/ and https://supabase.com/docs/guides/auth/redirect-urls .
