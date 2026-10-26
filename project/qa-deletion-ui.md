# Deletion dialog browser QA — 24 October 2026 (Asia/Bangkok)
Internal Chrome preview; existing synthetic account A. No final delete submission occurred.
- Dialog opens with Cancel focused and confirm disabled.
- Wrong phrase DELETE test-B leaves confirm disabled; Enter does not dismiss or delete.
- Exact phrase DELETE test-A enables confirm. Only enablement was checked, not submission.
- Tab from textbox with correct phrase reaches confirm, then Cancel. With blank phrase it skips disabled confirm and reaches Cancel.
- Shift+Tab from textbox reaches export link; Tab returns to textbox.
- Escape and Cancel activated by Enter both close the dialog and restore focus to the opening button.
- Keyboard Enter reopens dialog; input is blank and confirm disabled again.
- Tab after last dialog control briefly moves focus to browser chrome/body in this Chrome session. No claim of a custom focus trap or full accessibility compliance.
- Existing customer QA-A แก้ไข and won quote เว็บไซต์ทดสอบฐานข้อมูล, 15,900 baht, due 2026-10-27 remain visible after checks.
Visual finding and fix: disabled buttons previously looked like enabled buttons. Added explicit muted disabled background/text and not-allowed cursor; hover effect only applies when enabled. Rebuilt and inspected screenshot: disabled confirm is muted; exact phrase returns green (rgb 22,100,81).
Build passed after CSS edit. Prior automated suite remains 54/54, no server/behavior code changed in this increment; not rerun solely for CSS/docs.
Not tested: actual delete in browser, in-flight dismissal, screen reader, physical mobile, full keyboard/focus audit, export download. Server deletion coverage remains in deletion.test.mjs.
