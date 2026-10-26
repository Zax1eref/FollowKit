# Integration browser QA — 24 October 2026
Chrome, internal Sites preview running Node local test harness. All records synthetic.

| Check | Outcome / observed evidence |
|---|---|
| Anonymous initial state | Add disabled, zero data, select test account prompt |
| Test A create through UI→API→SQLite | Customer QA-A, quote 15,900 THB, dashboard 1 customer/1 due/1 pending |
| Page refresh | Same quote and totals returned after reload |
| Test B isolation | Zero customers/quotes/value; QA-A record not displayed |
| Return to A | Previously saved quote restored from API |
| Follow-up | Note saved, next date 2026-10-27, history read back from API |
| Test logout | No account selected, data cleared, Add disabled |
| Server restart | After selecting A again, quote and new due date still available |
| Edit won | Saved closed status; excluded from pending amount |
| Reuse existing customer | Added a second 2,000 THB quote via explicit customer selection; customer count remained 1 |
| Delete temporary quote | Confirmed and removed via API; pending 0/value 0, original won quote retained |
| Offline regression | /offline.html displays 4 seed customers, 3 pending, 55,000 THB; no API/test controls |

Initial preview connection refused because server ignored CLI --host flag. Implemented explicit --host/--port parsing per preview command; restarted then passed. Browser error-page observation was policy-blocked; no attempt to read that blocked internal error page. Normal HTTP site opened after configuration fix.
Toast visibility check timed out after short-lived success toast had disappeared; stable row state and reload verified save instead.
Native confirm causes click command timeout in this browser; explicit confirmation dialog handled and row deletion verified.
Not Run: real identity provider lifecycle, deployed production, physical phone, multi-worker load, production backup restore.
