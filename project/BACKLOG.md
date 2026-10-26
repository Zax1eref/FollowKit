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

# Next backlog — updated 24 October 2026
| Priority | Task | State | Acceptance |
|---|---|---|---|
| P0 | UI→API→SQLite local integration | DONE | Browser create/edit/delete/history + refresh/restart verified |
| P0 | Synthetic account isolation/session/CSRF | DONE test-only | Request tests and UI A/B checks, not production identity |
| P0 | Real customer interviews | BLOCKED | Specific participants/channel authorized; interview kit ready |
| P1 | Select production identity/runtime | DONE engineering decision; not provisioned | Respect Sites native identity if hosted there; independently accessible signup requirement reviewed |
| P1 | Actual provider signup/login/logout/reset | NOT STARTED | Configured test provider and actual lifecycle tests |
| P1 | Production persistence/tenant policies | NOT STARTED | Online DB + real identity isolation tests; no fake session routes |
| P1 | Pagination + create idempotency + rate limits | DONE local; production hardening pending | >500 record retrieval; response-loss retry; abuse tests |
| P1 | Account export + local backup/restore | DONE local | 46 tests; new-file restore, integrity/FK/schema checks; CLI verified |
| Synthetic account deletion | DONE server tests + non-destructive Chrome/keyboard QA | Exact owner confirmation, atomic data/dedup cleanup, all sessions revoked |
| Production deletion + backup/retention | NOT STARTED | Provider/billing coordination, restore erasure ledger, remote backup and retention policy |
| P1 | Customer management UI (edit/delete) | DONE; successful unlink/delete UI path not rechecked this round | Edit persistence and linked-customer rejection verified |
| P2 | Physical mobile/full a11y | NEEDS VERIFICATION | Current narrow iframe evidence is not device testing |
| P2 | Payments and public beta | NOT STARTED | Provider/KYC/test verification and approvals |

PostgreSQL schema/RLS/functions: implemented; 14 PGlite test groups passed. Native concurrent/provider tests pending. Next executable step: replace synchronous repository interface with async before Worker HTTP adapter integration.

25 October async repository + HTTP adapter DONE under mock/SQL contract tests (66 Node, 18 PGlite groups). Next: standalone Worker entry/config boundary; then actual provider HTTP/auth and multi-connection SQL verification.

Latest 25 October 2026: standalone API Worker candidate completed. Node 76/76 tests and workerd 7/7 smoke groups pass. Bundle excludes SQLite, synthetic harness and static assets; default configuration disables API. Fixed unsupported redirect mode using manual redirects with rejection, verified no redirect following. All provider responses mocked; no public deployment or real provider setup. See docs/worker-runtime.md. Next: standalone auth frontend using a mocked provider contract, followed by approved staging lifecycle/RLS/native concurrency checks.

Latest 25 October — standalone auth frontend contract: Thai login/signup/reset/recovery/logout views and injected SDK controller added. Main Node 85/85; jsdom 5/5 groups passed. Default boot disabled; preview is loopback-only, fixture-only, sends no email and persists no session. Browser visual QA blocked by unavailable Chromium/invalid download ZIP. Worker/SQL unchanged (prior 7/7 workerd, 18/18 PGlite). Read docs/auth-frontend.md. Next: bundle provider SDK, PKCE/callback integration and bearer handoff to Worker, then approved staging lifecycle validation.

Latest 25 October — SDK integration: Supabase JS 2.118.0 bundled; PKCE callback cleanup/validation and same-origin bearer account read implemented. Worker now serves only allowlisted auth assets through its configuration guard. Node 93/93, form DOM 5/5, actual SDK integration 8/8, bundled-entry DOM 2/2 and workerd 8/8 groups passed. Provider/data mocked; no real email/account/deployment. Read docs/auth-sdk-integration.md. Next connect quote/customer workspace to standalone session and define provisioning; actual-browser/live-provider gates remain.

Latest 25 October — standalone workspace: authenticated customer/quote CRUD, followup history, dashboard metrics and load-more pages implemented without synthetic controls. Session changes clear records and drafts; quote retry keys survive ambiguous responses. Node 102/102; auth DOM 5/5; SDK 8/8; bundled workspace DOM 7/7; workspace DOM 3/3; workerd 8/8 passed. Provider/data mocked; no visual browser or live deployment claim. See docs/standalone-workspace.md. Next explicit account provisioning with tombstone protection, then approved staging gates.

Latest 25 October — explicit account provisioning: GET onboarding status and confirmed POST create a free account/subscription using provider-owned verified identity. Migration 004 records retained identity tombstones on ledger/deleting/purge and blocks setup/read/write after deletion markers. Node 106/106; PostgreSQL WASM regressions 18/18 + provisioning 10/10; bundle DOM 9/9; workerd 9/9. No real provider or deployment. Read docs/account-provisioning.md for concurrency/restore limits. Next staging validation plan plus actual-browser/native integration checks.
