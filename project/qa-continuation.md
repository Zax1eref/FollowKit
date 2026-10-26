# QA continuation — 24 October 2026
Automated output: project/test-results.txt. Tests now cover API through real Request/Response objects and SQLite; identity and remote auth upstream are test fixtures.

Browser: Chrome, internal preview, iframe width 390px / content viewport 375px due to scrollbar. This is narrow-layout QA, not a physical mobile test.
- Passed: screenshot of dashboard/cards inspected; document scrollWidth=375 equals clientWidth=375 (no horizontal overflow in tested state).
- Passed: native dialog opened with Enter; named dialog and label association visible in accessibility tree.
- Passed: invalid due date before sent date displayed Thai error and did not save.
- Passed: corrected due date + Enter saved; search found sample; metrics 5 customers / 4 pending / 56,234 THB.
- Passed: Tab moved from customer field to title. Escape closed modal and returned focus to Add button.
- Not Run: real iOS/Android, mobile virtual keyboard, full screen reader audit, 320px/200% zoom and all viewport sizes.
No browser test uses a real account or data. Existing desktop tests remain prior-session evidence, not newly re-run in full.
Local UI still memory-only; API persistence tests do not imply browser persistence.
