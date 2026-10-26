export function bangkokDay(now=new Date()) {
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function validDay(value) {
 return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
}
export function validateQuote(q) {
 if(!q.customer?.trim() || q.customer.length>100) throw Error('กรอกชื่อลูกค้าไม่เกิน 100 ตัวอักษร');
 if(!q.title?.trim() || q.title.length>160) throw Error('กรอกชื่องานไม่เกิน 160 ตัวอักษร');
 if(!Number.isSafeInteger(q.amountSatang)||q.amountSatang<0||q.amountSatang>10000000000) throw Error('มูลค่าไม่ถูกต้อง');
 if(!validDay(q.sent)||!validDay(q.due)||q.due<q.sent) throw Error('วันติดตามต้องไม่ก่อนวันส่ง');
 if(!['pending','won','lost'].includes(q.status)) throw Error('สถานะไม่ถูกต้อง');
 return q;
}
export function isDue(q,today=bangkokDay()) {return q.status==='pending' && q.due<=today;}
export function metrics(rows,today=bangkokDay()) {
 return {customers:new Set(rows.map(q=>q.customer.trim())).size,due:rows.filter(q=>isDue(q,today)).length,pending:rows.filter(q=>q.status==='pending').length,value:rows.filter(q=>q.status==='pending').reduce((s,q)=>s+q.amountSatang,0)};
}
export function message(q) {return `สวัสดีครับ/ค่ะ คุณ${q.customer} ขอสอบถามเกี่ยวกับใบเสนอราคา ${q.title} ที่ส่งเมื่อ ${q.sent} หากมีคำถามหรือต้องการปรับรายละเอียด แจ้งได้เลยนะครับ/คะ หากยังไม่สะดวกตัดสินใจ สามารถแจ้งช่วงเวลาที่เหมาะสมให้ติดตามอีกครั้งได้ครับ/ค่ะ`;}
export function canCreate(plan,count) {return ['free','paid'].includes(plan)&&Number.isInteger(count)&&count>=0&&count<(plan==='paid'?500:10);}
