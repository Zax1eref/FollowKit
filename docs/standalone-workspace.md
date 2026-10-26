> Updated: explicit signup provisioning is now implemented; see account-provisioning.md for current flow, evidence and remaining release gates.

# Standalone customer and quote workspace — 25 October 2026

The authenticated app now opens its customer/quote workspace after the SDK session passes the Worker's account lookup. `src/workspace` supplies the view and state model; it does not import the synthetic A/B harness or offline sample data. The original local SQLite/offline application remains available separately for regression/development.

## Implemented workflow

- Customer create/edit/delete, including the server's linked-quote deletion rejection.
- Quote create/edit/delete, integer-satang amount conversion and pending/won/lost states.
- Followup notes/history and next-due date, with closed-quote enforcement left to the server.
- Server dashboard totals, plus cursor-based load-more controls for customers and quotes. Customer selection uses the loaded customer pages; the UI tells users to load additional pages when necessary.
- JSON bearer requests to allowlisted same-origin API paths, current SDK token per request, no cookies/redirects, bounded response reading and abort on session changes.
- No automatic mutation retries. Quote/followup retries retain their idempotency key for the same form payload after an ambiguous response. Successful writes clear the draft; failure to refresh afterward is shown as a saved-but-not-refreshed message. Customer creation has no server dedup contract: after a network failure, reload before retrying.
- Busy state prevents duplicate actions; ordinary text is rendered with textContent. Signout, recovery, account switch or authorization rejection clears records, cursors, metrics, selections, edit IDs, notes, draft fields and retry keys. Late requests cannot repopulate the cleared workspace.

## Verification

| Suite | Result |
|---|---|
| Main Node suite | 102/102 |
| Auth-form DOM | 5/5 groups |
| SDK integration | 8/8 groups |
| Bundled entry + SDK + Worker + mocked provider/data | 7/7 groups |
| Workspace DOM, retry key and clearing | 3/3 groups |
| workerd runtime/assets | 8/8 groups |

The bundled-entry test creates and edits customers/quotes, adds a followup, changes quote status, checks linked-customer deletion rejection, logs out, logs in as another fixture user, verifies empty records, returns to the first fixture user and deletes the quote/customer. Data lives in a test-only memory fixture behind the real HTTP repository; this does not establish real PostgreSQL transactions or live provider isolation. The separate existing PostgreSQL WASM suite remains prior 18/18 evidence; SQL was unchanged.

The model tests cover delayed responses after clearing, duplicate writes, page deduplication, server errors and confirmed-write/refresh-failure separation. Workspace DOM checks cover untrusted customer text, retry-key reuse after a simulated lost response and clearing drafts/records. jsdom does not verify real browser layout, CSS/CSP enforcement, accessibility or native form interactions. Visual/browser QA remains pending from the prior unavailable Chromium setup.

## Reproduce

Use the build/test commands in `auth-sdk-integration.md`, plus:

```sh
npm --prefix tools/auth run test:workspace
```

The full standalone bundle is in `auth-dist/auth`, served by the guarded Worker asset routes. The old `scripts/auth-preview.mjs` remains an auth-form-only fixture preview; it is not the integrated workspace preview. No production bindings, accounts or email service are configured. The API remains disabled by default and there is no public deployment.

## Remaining work

New provider signups still need an explicit application-account provisioning flow. Missing/inactive accounts are denied, never created automatically on ordinary API requests. Next implement and test provisioning with deletion/tombstone protections, then validate native concurrency, live provider lifecycle/direct RLS and old-token revocation in approved staging. Workspace search/filter, copy-message helper, account export UI and production deletion UI are not ported in this increment. Existing local-harness export/deletion features are not proof of production capability. Market metrics and spending remain zero.
