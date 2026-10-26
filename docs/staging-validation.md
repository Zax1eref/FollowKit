# Staging validation packet — 26 October 2026

Status: NOT READY for public signup. Local real-browser checks now pass. Native concurrent SQL, live provider lifecycle and operational recovery gates are still open. This packet does not create a service, spend money, deploy, send email or authorize accepting real data.

## Verified locally

| Gate | Evidence | Scope |
|---|---|---|
| App regressions | Node 106/106 | Local code and fixture identities |
| Real browser | Chromium 153.0.8010.0, 8/8 groups | Actual bundled SDK/UI and workerd; provider/data intercepted locally |
| SQL policies and onboarding | Prior PGlite 18/18 + 10/10 | PostgreSQL WASM, sequential execution |
| Worker boundary | workerd 9/9 | Real runtime and assets, outbound stubs |
| Layout | 1280px and 390px screenshots inspected internally | Thai glyphs render; no horizontal overflow; not physical-device testing |

Chromium checks cover keyboard focus from email to password, explicit onboarding, customer/quote creation, satang conversion, followups/history, responsive layout, persisted session in a second tab, cross-tab logout clearing, next-identity isolation, invalid callback cleanup and no unexpected page errors/origins. This is not full screen-reader/a11y, cross-browser or security penetration testing. It does not validate real email links, expiry, provider settings or provider JWT revocation.

The earlier Chromium download blocker was resolved using a pinned packaged binary. Its archive ownership restoration failed in this environment; the preparation script extracts the same files as the current user without changing ownership. The test filters out disable-web-security and allow-running-insecure-content flags. It still uses the serverless Chromium process/sandbox configuration, so it is functional browser evidence, not proof of browser process isolation. All app/provider traffic is intercepted by the test harness; no live service is contacted.

The first screenshots exposed missing Thai system fonts. The app now bundles the Thai subset of Noto Sans Thai Variable 5.3.0, served from the same origin with font-src self. It makes no Google Fonts/CDN request. `auth-dist/FONT-LICENSE.txt` preserves the font license. New screenshots were inspected after the font loaded. Screenshots are temporary internal QA artifacts and are not part of the release ZIP.

## Reproduce browser validation

Build the app and Worker using the existing documented commands, then:

```sh
npm ci --prefix tools/browser
npm --prefix tools/browser run prepare:browser
npm --prefix tools/browser test
```

The browser runner uses local provider/data fixtures and actual workerd. It writes temporary screenshots under /tmp and a textual result to stdout. Do not substitute production origins/credentials into the fixture runner.

## Native PostgreSQL concurrency gate — UNRUN

This host has no native PostgreSQL executable and runs as root. Launching a child with a non-root identity fails with Operation not permitted, while PostgreSQL initdb requires a non-root OS user. No permissions override was attempted. `project/native-preflight-results.txt` records this blocker.

An opt-in native runner is supplied in `tests/native/run.mjs`; it has been syntax-checked, not executed against PostgreSQL. On an authorized disposable local PostgreSQL instance, install its pinned pg dependency and set `FOLLOWKIT_NATIVE_TEST_URL` in the environment to an administrative connection to the postgres database. The runner rejects non-loopback hosts, other database names and URL query options. It creates a unique test database and random NOLOGIN role names, applies all four migrations with test-only provider identity, and drops only those generated objects afterward. Cleanup failures name the generated objects for manual removal. Do not run it against a shared production cluster.

```sh
npm ci --prefix tests/native
# Set FOLLOWKIT_NATIVE_TEST_URL through the local test environment; do not commit it.
npm --prefix tests/native test
```

Prepared scenarios (none currently passed): simultaneous setup; two writers competing for the final quota slot; simultaneous duplicate idempotency keys; setup waiting behind a committed deletion marker; setup waiting behind a rolled-back marker. The last two inspect pg_stat_activity for advisory-lock blocking before releasing the transaction. The runner times out long statements/locks and reports failures rather than assuming concurrency is safe. A five-group pass is required before this gate closes; extend it with repeated stress/deadlock outcomes if failures reveal a gap.

## Required staging inputs and approval boundary

No target project or deployment credentials have been chosen. Before a real staging run, identify the approved standalone Worker project/origin, Supabase project/region, test-only email recipients/SMTP configuration, migration operator, budget limits and rollback owner. Configure exact /auth/callback and /auth/recovery redirect URLs, email verification enabled and anonymous sign-in disabled. Verify current provider limits/prices at that point. Keep service secrets out of browser bindings and ordinary user requests.

Provisioning external services, deployment, real emails and spending remain outside this locally completed step. FOLLOWKIT_API_ENABLED remains false in committed configuration; workers.dev and preview URLs remain disabled. A future deployment should target a concrete reviewed staging project with these gates, not the synthetic harness.

## Staging acceptance sequence

1. Apply migrations 001–004 to a disposable staging database; verify schema, grants, RLS and provider-owned identity columns. Confirm no application account is created by signup alone.
2. Test signup, confirmation, login and explicit free-account setup with two approved test identities. Repeat setup and verify plan/subscription stability. Unverified and anonymous identities must fail both Worker and direct RPC access.
3. Test PKCE recovery in the initiating browser, expired/reused codes, a fresh browser without the verifier, URL cleanup and redirect allowlist. Verify that recovery never silently enters the workspace.
4. Test customer/quote/followup CRUD and pagination through Worker and direct PostgREST. Attempt owner/plan injection, foreign UUIDs, quota bypass and foreign retry keys; retain status codes and database row counts without tokens.
5. Test logout and replay of the old access token through Worker and direct data API. Record the actual revocation bound; current local session clearing does not prove immediate server revocation.
6. Verify tombstone denial on reads/writes/setup, deletion/provisioning overlap and rollback on native multi-connection PostgreSQL. Inspect conflicts/deadlocks and define bounded safe retry behavior before accepting this gate.
7. Establish the authoritative retained deletion record outside the backup being restored; run a restore drill that cannot revive deleted subjects. Retention, provider deletion/billing orchestration and account export/deletion UI remain incomplete.
8. Run browser/mobile/a11y checks on the actual origin and production CSP, followed by rollback to API-disabled configuration. Publish a pass/fail report with environment versions, timestamps and redacted evidence before considering public beta.

Do not count fixture users, synthetic accounts or these local checks as customer validation. Interviews, real signups, active users, paying users, revenue and new spending remain zero.

## Manual CI route prepared on 26 October

The repository now includes `.github/workflows/native-postgres.yml`. After an approved repository push, an operator can select **Native PostgreSQL concurrency gate → Run workflow**. This task did not push or dispatch it. Check CI availability/budget before starting. The workflow only tests; it does not deploy.

The job uses a disposable PostgreSQL 18 service mapped to loopback, Node 24, locked dependencies, a read-only repository token and a ten-minute job deadline. Its fixed password belongs only to that disposable service; do not reuse it for staging. It runs configuration guards, then all five native groups in three separate invocations (new database/roles each time). A failure stops the job. GitHub job logs retain the engine version and each result; record the run URL and commit when reviewing evidence. Major-version action/image tags can move, so record resolved versions from the run before comparing results across runs.

Configuration guard tests passed locally (3/3); workflow YAML and runner syntax were checked. Neither the workflow nor native database scenarios have executed. A green workflow is native engine evidence with simulated identity, not live Supabase lifecycle/RLS or operational restore acceptance. The first three scenarios issue requests from separate connections concurrently; the last two explicitly observe advisory-lock blocking. Three repetitions are a bounded regression check, not exhaustive race/deadlock stress proof.

References consulted 26 October 2026: [GitHub PostgreSQL service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers) and [GitHub example workflow](https://docs.github.com/en/actions/tutorials/create-an-example-workflow).

## Offline configuration check

Use `staging-preflight.md` and the incomplete `config/staging-plan.example.json` to inspect a proposed configuration before an approved staging run. Passing this offline check does not close any live acceptance gate. Node regression suite now passes 113/113; native concurrency remains UNRUN.
