## Staging URL configured — 26 October 2026

Prepared the user-selected origin `https://followkit.hakimihaika219.workers.dev` in `wrangler.staging.jsonc`, Worker name `followkit`. Entry URL: `/auth/`. Supabase project URL and publishable key are configured; no admin/service key is included. The default config remains disabled. This is a deployment preparation commit, not confirmation of a live deployment or changed Auth settings.

Node 115/115 tests pass. Primary workers.dev names are validated; preview URLs remain disabled. The target offline preflight passes while releaseReady remains false. Follow `docs/cloudflare-staging-target.md` to apply the exact Auth redirects and Cloudflare build/deploy commands. The pending native gate in generic checker output is superseded by the verified PostgreSQL 17/18 CI evidence below.

## Supabase staging schema installed — 26 October 2026

The native CI gate now passes on both PostgreSQL 17.11 and 18 (five scenarios, three repetitions per engine). Run: https://github.com/Zax1eref/FollowKit/actions/runs/40281596660 on commit 2bcd413a9fc66f9153ab5562238dc8d00c910a0c. Relevant schema/test/workflow pushes now trigger this matrix; manual runs remain available.

All four existing SQL migrations were applied to the user-designated empty Supabase staging project. Live checks confirm RLS on nine tables, no anon reads or RPC execution, no direct authenticated writes, and five owner-scoped SELECT policies. A rolled-back role smoke test rejects anonymous table/RPC access and identityless authenticated onboarding/writes. No Auth users or business records were created. This is schema/permission evidence, not real two-user lifecycle or HTTP/RLS acceptance.

Security Advisor reports intentional privileged RPC warnings (10) and default-deny private tables without policies (4 INFO). Performance Advisor reports two composite-FK index notices and five unused indexes on the empty database. These findings are documented in docs/supabase-staging-install.md; they are not claimed resolved or clean. No frontend deployment, email or billing change occurred. Next: choose the Cloudflare staging origin, verify Auth settings and run actual provider lifecycle/direct-RLS checks.

Earlier dated checkpoints below are historical and superseded by this status.

## Offline staging preflight — 26 October 2026

Added `scripts/staging-preflight.mjs` and a deliberately incomplete `config/staging-plan.example.json`. The checker validates the planned bindings through the actual Worker configuration guard, plus exact callback/recovery URLs, verified-email/anonymous-auth settings and guarded asset routing. It performs no network calls or mutations and emits error codes without submitted values. Unexpected bindings, secret-key formats, malformed/oversized input and equivalent app/provider origins are rejected.

Validation this increment: Node **113/113** passed, including seven new preflight tests. Running the incomplete example correctly exits 2 with `configurationValid:false` and `releaseReady:false`. Even a valid plan always reports `releaseReady:false` because it cannot verify actual provider settings, approval or live acceptance gates. Prior browser 8/8 and workerd 9/9 are retained evidence, not reruns. Native PostgreSQL and CI remain UNRUN; no push, provider setup, deployment or spending occurred.

Read `docs/staging-preflight.md` for input format, commands and limits. The next environment-dependent step still needs a concrete approved staging target or execution of the manual native CI gate; this checker does not substitute for either.

## Native CI preparation — 26 October 2026

Added `.github/workflows/native-postgres.yml`, manually triggered only. It runs Node 24 against a disposable PostgreSQL 18 service through loopback, installs the locked native dependencies and repeats all five native groups three times with fresh databases. It uses read-only repository permissions and has no deployment/provider secrets. No remote push or workflow dispatch was performed; native results remain UNRUN.

Native connection validation now rejects malformed/remote/option-overridden URLs without echoing credentials and bounds connection attempts to five seconds. Local validation: 3/3 configuration guard tests, JavaScript syntax and YAML structure pass (`project/native-ci-preparation-results.txt`). These are preparation checks, not native concurrency results. Prior Chromium 8/8, Node 106/106 and workerd 9/9 evidence is unchanged and was not rerun for this test-only increment.

Next: review and run this manual workflow in an approved repository/runner with sufficient CI allowance, retain the run URL and engine version, and require all three iterations to pass before closing the native gate. Provider identity remains simulated even when this workflow passes.

## Current checkpoint — 26 October 2026

Standalone browser readiness completed locally: Chromium 153.0.8010.0 passes 8/8 groups with the real bundled UI/SDK and workerd, using intercepted provider/data fixtures. Thai font is bundled and served from the app origin; desktop 1280px/mobile-width 390px screenshots were inspected internally. Node 106/106 and workerd 9/9 were rerun successfully. SQL WASM 18/18 + 10/10 and other DOM/SDK results below are retained prior evidence, not reruns in this increment.

Native PostgreSQL concurrency remains UNRUN: no native server is available and the host cannot launch a non-root child. An opt-in loopback-only runner with five scenarios is prepared and syntax-checked; it is not a passing concurrency result. Live provider/email, direct online RLS, restore reconciliation, physical devices and full accessibility remain open. No external deployment, real email, customer data or spending occurred. Default deployment remains disabled.

Read `docs/staging-validation.md` for reproduction, scope, required staging inputs and acceptance/rollback gates. Next: execute the native runner on an authorized disposable local PostgreSQL instance, then configure and validate a concrete approved staging environment. Earlier dated entries below are historical and are superseded by this checkpoint.

# FollowKit — integrated local test build
Latest: 24 October 2026. Status IN PROGRESS: UI→API→SQLite works with **synthetic A/B accounts only**.

## Run the connected version
Node.js 22+ (tested 24.19.0). Extract ZIP, open terminal in followkit:

```sh
npm test
npm run build
npm run dev
```
Then open http://127.0.0.1:4173/#dashboard. Select A or B, create a fictional quote, refresh to verify persistence.
No npm install needed; no external dependencies or API keys. Stop with Ctrl+C.
Database created at .local/test.sqlite; not included in release ZIP. Do not enter real customer data.

## Offline version
Open dist/index.html or FollowKit-Prototype.html directly. This mode uses memory-only sample data; no API connection/persistence.

## Important distinction
A/B selection is a test fixture, NOT signup/login. Do not deploy the test harness publicly.
Real authentication, online database, payments, production deployment and customer validation still incomplete.
Docs/test-runtime.md describes session limits, CSRF and remaining risks. Project/EXECUTION-REPORT.md and STATUS.md are latest status. Run tests before continuing.
Source: src/client-api.mjs, src/app.mjs, src/server/{api,store,test-harness,dev,auth}.mjs.

## Reliability increment
39 automated tests pass. Quote creation supports durable Idempotency-Key replay; collections have cursor pagination; local owner rate limits return 429. Customer manager edits name/contact and rejects deletion while quotes remain. See docs/test-runtime.md for limits and project/qa-reliability.md for this round’s browser evidence.

## Export and recovery increment
46 automated tests pass. Connected test mode offers account JSON export. Operator CLI supports backup, verify and restore to a new file without overwriting the active database. See docs/data-recovery.md for commands, verified behavior and limitations. Runtime backup files remain excluded from ZIP.

## Confirmed deletion increment
54 tests pass. Connected test mode includes a typed-confirmation dialog for deleting the selected synthetic account, with atomic owner cleanup and session revocation. Existing backup/export files remain. See docs/account-deletion.md for scope and verification limits.

Deletion dialog Chrome/keyboard QA completed without deletion; disabled button styling clarified. Evidence and limits: project/qa-deletion-ui.md.

## Production target (not deployed)
Standalone Cloudflare Workers + Supabase Auth/PostgreSQL selected to meet independent signup/reset requirements. See docs/production-decision.md and production-migration-plan.md. The only runnable application remains the local harness; portable errors were extracted and all 54 tests/build pass.

## PostgreSQL foundation (25 October)
Separate candidate SQL migrations and six RPCs now pass 14 test groups in PostgreSQL WASM/PGlite. Run the optional suite using docs/postgres-foundation.md; main local suite remains 54/54. Native concurrency and Supabase auth are not verified. App runtime still uses SQLite.

## Async API / HTTP adapter
66 Node tests and 18 PGlite test groups pass. API now awaits repository operations and supports a per-request Supabase HTTP adapter. This adapter is not wired to a live provider; the default app remains local SQLite. See docs/http-repository.md for contracts, reproduction and limitations.

Latest 25 October 2026: standalone API Worker candidate completed. Node 76/76 tests and workerd 7/7 smoke groups pass. Bundle excludes SQLite, synthetic harness and static assets; default configuration disables API. Fixed unsupported redirect mode using manual redirects with rejection, verified no redirect following. All provider responses mocked; no public deployment or real provider setup. See docs/worker-runtime.md. Next: standalone auth frontend using a mocked provider contract, followed by approved staging lifecycle/RLS/native concurrency checks.

Latest 25 October — standalone auth frontend contract: Thai login/signup/reset/recovery/logout views and injected SDK controller added. Main Node 85/85; jsdom 5/5 groups passed. Default boot disabled; preview is loopback-only, fixture-only, sends no email and persists no session. Browser visual QA blocked by unavailable Chromium/invalid download ZIP. Worker/SQL unchanged (prior 7/7 workerd, 18/18 PGlite). Read docs/auth-frontend.md. Next: bundle provider SDK, PKCE/callback integration and bearer handoff to Worker, then approved staging lifecycle validation.

Preview the auth forms separately: `node scripts/auth-preview.mjs`, then open http://127.0.0.1:4174/auth/. Fixture credentials and recovery simulation are displayed on the page. This does not connect to the quote workspace.

Latest 25 October — SDK integration: Supabase JS 2.118.0 bundled; PKCE callback cleanup/validation and same-origin bearer account read implemented. Worker now serves only allowlisted auth assets through its configuration guard. Node 93/93, form DOM 5/5, actual SDK integration 8/8, bundled-entry DOM 2/2 and workerd 8/8 groups passed. Provider/data mocked; no real email/account/deployment. Read docs/auth-sdk-integration.md. Next connect quote/customer workspace to standalone session and define provisioning; actual-browser/live-provider gates remain.

Latest 25 October — standalone workspace: authenticated customer/quote CRUD, followup history, dashboard metrics and load-more pages implemented without synthetic controls. Session changes clear records and drafts; quote retry keys survive ambiguous responses. Node 102/102; auth DOM 5/5; SDK 8/8; bundled workspace DOM 7/7; workspace DOM 3/3; workerd 8/8 passed. Provider/data mocked; no visual browser or live deployment claim. See docs/standalone-workspace.md. Next explicit account provisioning with tombstone protection, then approved staging gates.

Latest 25 October — explicit account provisioning: GET onboarding status and confirmed POST create a free account/subscription using provider-owned verified identity. Migration 004 records retained identity tombstones on ledger/deleting/purge and blocks setup/read/write after deletion markers. Node 106/106; PostgreSQL WASM regressions 18/18 + provisioning 10/10; bundle DOM 9/9; workerd 9/9. No real provider or deployment. Read docs/account-provisioning.md for concurrency/restore limits. Next staging validation plan plus actual-browser/native integration checks.
