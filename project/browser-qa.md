# Browser QA — 24 October 2026
Environment: cloud Chrome, internal local preview http://terminal.local:4173/ (not public hosted URL).

| Test | Result | Evidence observed |
|---|---|---|
| Landing visual | Passed | Desktop screenshot inspected; Thai headline, CTA, demo disclaimer visible |
| Navigate dashboard | Passed | 4 sample customers, 2 due, 3 pending, 55,000 THB pending value |
| Create quote | Passed after fix | QA sample 1,234.50 THB →5 customers, 3 due, 4 pending, 56,234.50 total |
| Update to won | Passed | Coffee sample marked won →1 due, 2 pending, 37,000 THB |
| Due filter | Passed | Only studio sample shown after coffee won |
| Thai message/edit | Passed | Studio/date/title populated; replaced text in textarea |
| Copy | Passed | Clipboard read returned exact edited test text |
| Delete | Passed | Confirmed delete studio; due filter became empty; pending value 12,000 THB |
| Empty state | Passed | No matching items text visible |
| Interest form | Passed demo | qa@example.com + checkbox, submit → explicit no storage/no waitlist notice; fields cleared |
| Full mobile visual | Not Run | CSS breakpoint implemented, no actual mobile viewport run |
| Full accessibility | Not Run | Labels/native controls/focus CSS implemented; full keyboard/screen reader audit pending |
| Auth/reset/online tenant isolation/payment | Not Run | Not implemented |

Initial create attempt failed: crypto.randomUUID unavailable on preview HTTP. Replaced with monotonic local-only sample IDs and reran successfully.
An edit selector later failed because rebuild refreshed the page and removed memory-only QA sample; reobserved state and tested editing a seed record successfully.
Delete click tool timed out while native confirm was open; read actual dialog, accepted, verified row removal. Not counted as product deletion failure.
No sample test counts as user, customer interview, signup or revenue.
