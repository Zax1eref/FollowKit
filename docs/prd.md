# PRD v0.1 — FollowKit
24 October 2026 / Owner: project owner / Status: draft for validation
เป้าหมาย: ให้ฟรีแลนซ์รับทำเว็บไซต์ไทยทำ follow-up ที่ตั้งใจไว้ได้ครบ โดยเห็น due work และข้อความตั้งต้นในหน้าเดียว
Non-goal: รับประกันยอดขาย, CRM ทั้งระบบ, invoice/accounting, ส่ง LINE/email อัตโนมัติ

## Scope
Must-have สำหรับ MVP: managed auth (signup/login/logout/reset), customer CRUD, quote CRUD, due dashboard, editable Thai templates, follow-up history, account deletion/export, server authorization, free/paid entitlement, verified payment test adapter ก่อน commercial release
Must-have วันที่ 1: landing demo, simulated interest form, quote workflow prototype, domain tests, schema foundation
Later: email reminder, CSV import, team seats, real payment เมื่อผ่าน gate, integrations ตามหลักฐาน
Out of scope: AI paid API, auto-messaging, native mobile, accounting/tax invoices, read receipts, agency multi-tenant teams ในรุ่นแรก

## Stories and acceptance criteria
| ID | Story | เกณฑ์ทดสอบ | Day 1 |
|---|---|---|---|
| A1 | สมัครและเข้าใช้ | verified email + managed password policy; invalid login ไม่เผยว่ามีบัญชี; logout revoke session; reset token ครั้งเดียว/หมดอายุ | NOT STARTED |
| C1 | จัดการลูกค้า | create/edit/delete เฉพาะเจ้าของ; ชื่อ 1–100; ป้องกันลบ record ที่มี quote โดยไม่ยืนยัน | NOT STARTED (demo มีชื่อใน quote ไม่ใช่ customer CRUD แยก) |
| Q1 | บันทึกใบเสนอราคา | title 1–160, amount สตางค์ >=0, due>=sent, invalid date rejected; create/edit/delete แสดงผลทันที | DONE เฉพาะ local demo |
| D1 | รู้ว่างานไหนถึงเวลา | due = pending AND due_on <= Bangkok today; won/lost ไม่นับ; pending value รวม integer satang | DONE domain + demo |
| T1 | เตรียมข้อความ | ข้อมูลแสดงเป็นข้อความ ไม่ตีความ HTML; แก้และ copy ได้; copy failure มี fallback; ไม่ส่งอัตโนมัติ | demo implemented |
| F1 | บันทึกการติดตาม | เจ้าของเพิ่ม event พร้อม next due ได้ transaction เดียว; retry ไม่ duplicate | schema draft; API NOT STARTED |
| S1 | ใช้สิทธิ์แผน | free 10 open quotes, paid 500 เป็นสมมติฐาน; enforce server + concurrency test; client เปลี่ยน plan ไม่ได้ | domain helper only |
| P1 | การจ่ายเงิน | verified webhook + unique provider/event; duplicate safe; out-of-order reconciliation; test/live แยก | payment adapter NOT STARTED |
| I1 | แสดงความสนใจ | ก่อน production: purpose/retention/contact notice, consent version/time, withdrawal, minimal data, abuse control | demo only; no data stored |
| X1 | แยกข้อมูล | A อ่าน/แก้/ลบ data ของ B ไม่ได้ทั้ง API และ DB policy; direct ID probing ถูกปฏิเสธ | NOT RUN |

ตัวเลข metrics: เป้าหมาย interviews 5; real signups 10; activated 3; paying 1 (stretch) ภายใน 22 November ไม่รับประกัน
Activated: real verified user สร้าง quote และบันทึก follow-up อย่างน้อย 1 ครั้ง; copy click ไม่พิสูจน์ว่าส่งจริง
Success workflow: >=4/5 ผู้ทดลองทำ task โดยไม่ช่วย และมี >=2 คนขอทดลองต่อ; ไม่ใช่ statistically validated product-market fit
