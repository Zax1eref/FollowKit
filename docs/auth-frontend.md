> Updated: SDK/callback/account integration is now implemented; see auth-sdk-integration.md for the current runtime and results. Earlier constraints below describe the prior increment.

# Standalone auth frontend contract — 25 October 2026

`src/auth` adds Thai login, signup, password-reset request, recovery password update, account status and logout views. This is a separate SDK-contract candidate: no real provider is configured, and no account/session/data is persisted. The existing quote UI and Worker are unchanged. There is no dashboard link pretending the integration is complete.

Run `node scripts/auth-preview.mjs`, then visit `http://127.0.0.1:4174/auth/`. The loopback-only preview injects an explicitly labelled in-memory fixture; use demo@example.test / demo-password-123. Signup/reset do not send email. The recovery button emits a simulated provider event. Refresh clears the fixture session. Never enter real credentials. Default `src/auth/boot.mjs` disables controls; it does not initialize any provider. The Worker still serves API routes only and does not serve this preview.

## Contract and behavior

The controller accepts the provider SDK auth interface: onAuthStateChange, signInWithPassword, signUp, resetPasswordForEmail, updateUser and signOut. No custom password storage, token parsing or token issuance is implemented. SDK methods and events follow the official references below; the SDK itself is not yet bundled or integrated. Callback URLs are fixed under the validated HTTPS app origin, never taken from user-supplied next/redirect parameters. Provider callback processing, PKCE verifier persistence/exchange and invalid/expired callback handling are still release gates.

Only verified, non-anonymous session metadata shows account status. This is a UI gate, not authorization; the Worker still verifies identity independently. PASSWORD_RECOVERY opens the update form; refresh/user events do not dismiss recovery. Signup/reset messages avoid asserting account existence. Provider errors are sanitized. Duplicate submits are blocked, password fields clear on submit/navigation, and stale operation completion cannot undo a received SIGNED_OUT event. Logout requests global scope; failures retain a blocked retry view. No claim is made that existing access JWTs are immediately revoked.

The view uses labelled fields, autocomplete hints, live status, disabled controls during work and heading focus on transitions. It has responsive CSS, but visual mobile/full accessibility QA remains pending. Local preview CSP blocks all connections and external resources; it is not a production CSP configuration.

## Verification

- Main Node suite: 85/85, including nine auth-controller groups.
- Optional DOM suite: `npm ci --prefix tools/auth && npm --prefix tools/auth test`. Five groups cover wrong/correct credentials, password clearing, focus, logout, signup confirmation, reset and recovery forms.
- Browser QA attempted: Playwright installed, but no Chromium executable; browser download repeatedly returned an invalid ZIP. No visual/rendering or real-browser pass is claimed.
- Worker 7/7 and PostgreSQL WASM 18/18 remain prior results; their code/SQL was unchanged in this increment.

## Next steps

Bundle the supported SDK with explicit PKCE settings; implement exact callback routes and URL cleanup, test expired/reused/wrong-device codes and safe return paths. Connect refreshed bearer tokens to the same-origin Worker API, remove account data promptly on signout/identity change, and test cross-tab/session races. Then run approved staging provider signup/email confirmation/reset/logout, old-token replay through Worker and direct data API, native multi-connection isolation and visual/browser QA. Do not provision, send real emails or deploy from this fixture preview.

References checked 25 October 2026:
- https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail
- https://supabase.com/docs/reference/javascript/auth-onauthstatechange
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/signout
