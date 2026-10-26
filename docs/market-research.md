# Market research v0.1 — 24 October 2026
## Decision
เดินหน้าต้นแบบที่ย้อนเปลี่ยนได้ ยังไม่ผ่าน validation gate สำหรับการสร้างระบบเต็ม
เลือกฟรีแลนซ์รับทำเว็บไซต์ไทยเป็น early segment เดียว (HYPOTHESIS); ยังไม่ pivot ผลิตภัณฑ์หลัก

## Facts และหลักฐาน
FACT: มีเครื่องมือ CRM ฟรีและซอฟต์แวร์บัญชีไทยที่สร้างใบเสนอราคาได้ ดูแหล่งทางการ 10 รายใน competitors.md
FACT: FlowAccount Standard เก็บ 1,990 บาท/ปี ใกล้กับราคา FollowKit 199–299 บาท/เดือนที่เป็น HYPOTHESIS
INTERPRETATION: FollowKit ต้องลดภาระการจดจำ/กรอกข้อมูลได้อย่างเห็นชัด ไม่ใช่อ้างว่าราคาถูกเพียงอย่างเดียว

## Problem evidence ledger
ทุกแหล่งตรวจ 24 October 2026; เป็น self-report สาธารณะ ไม่ใช่การสัมภาษณ์ของเรา ไม่ทราบตัวตน/ความเป็นตัวแทนของตลาดไทย

| ID | ต้นทาง | เนื้อหาที่พบ / น้ำหนัก / ข้อขัดแย้ง |
|---|---|---|
| E1 | https://www.reddit.com/r/webdev/comments/1q7f3ca/long_sales_cycles_and_missed_follow_ups_as_a/ | เปิดเนื้อหาได้: freelance dev จำการติดตามและบริบทไม่ได้เมื่อวงจรขายยาว ใช้ notes/spreadsheets/reminders แล้วไม่ต่อเนื่อง; relevance สูง แต่เป็น 1 self-report และไม่ใช่ไทย |
| E2 | https://www.reddit.com/r/Entrepreneur/comments/1jpzqqu/freelancers_how_do_you_deal_with_being_ghosted/ | เปิดได้: ความไม่แน่ใจว่าเปิด proposal หรือยังทำให้ลังเลติดตาม; ความคิดเห็นบางส่วนติดตาม 2–3 รอบ บางส่วนไม่ติดตามเลย; ผู้โพสต์พูดถึงการสร้างเครื่องมือ จึงมี builder bias |
| E3 | https://www.reddit.com/r/freelance/comments/iu5pww/what_is_up_with_potential_clients_just_ignoring/ | เปิดได้: แม้ติดตามและมีสัญญาณเปิดอ่านก็ไม่ได้คำตอบ; หลักฐานค้านว่าการเตือนอย่างเดียวเพิ่ม conversion ได้เสมอ; กระทู้เก่า น้ำหนักต่ำถึงกลาง |
| E4 | https://www.reddit.com/r/Freelancers/comments/1qvgqs5/anyone_else_mentally_exhausted_by_followups_not/ | search snippet พบภาระทางใจในการจำ proposals/follow-ups; open error จึงเป็น lead ที่ต้องตรวจ ไม่ใช่หลักฐานอ่านครบ |
| E5 | https://www.reddit.com/r/freelance/comments/qdlxco | snippet ถามจังหวะติดตามโดยไม่รบกวน; open error จึง NEEDS VERIFICATION |

หลักฐานอ่านเต็มที่เกี่ยวข้อง: 3 แหล่ง; อีก 2 เป็น leads ไม่ให้นับว่า validation gate 5 ชิ้นสำเร็จ
E1 replies เสนอ diary, daily time block, CRM ที่ใช้อยู่, Notion — แสดงว่าทางแก้อาจเป็นวินัย ไม่ใช่ซื้อซอฟต์แวร์
E2 ไม่ได้พิสูจน์ว่าต้องการ dashboard; อาจต้องการ proposal view tracking ซึ่งยัง out of scope

## Hypotheses to falsify
H1: คนส่งข้อเสนอ >=5 ครั้ง/เดือนและมี >=3 งานเปิดพร้อมกัน ประสบปัญหาติดตามเป็นประจำ
H2: การเห็น next action และข้อความในหน้าเดียวลดเวลา/ความลังเล
H3: คนกลุ่มนี้ยอมจ่าย 199 หรือ 299 บาท/เดือน แทนการใช้ปฏิทินฟรี
H4: ยอมกรอกงานโดยไม่เชื่อม LINE/Gmail ในรุ่นแรก
ทุกตัวเลขใน H1 เป็นเกณฑ์คัดเลือกทดลอง ไม่ใช่สถิติตลาด

## Unknown
ขนาดตลาดไทย; ความถี่ปัญหาจริง; จำนวนโอกาสที่เสียเพราะลืม; WTP; ช่องทางที่เข้าถึงได้โดยได้รับอนุญาต; retention; ความจำเป็น LINE integration
ไม่คำนวณ TAM/CAC จากข้อมูลที่ไม่มี ไม่สรุปยอดขายจากราคาคู่แข่ง

## Next evidence
สัมภาษณ์ 5 คน เป้าหมายไม่ใช่ผลจริง: >=3 คนเล่าปัญหาย้อนหลังอย่างเจาะจง, >=2 คนขอทดลองโดยสมัครใจ, >=1 คนยอมคุยราคาพร้อมเหตุผล
เกณฑ์นี้เป็น decision heuristic ไม่ใช่การยืนยันทางสถิติ หากไม่ผ่าน ให้ปรับ problem/segment ก่อนเพิ่ม backend
