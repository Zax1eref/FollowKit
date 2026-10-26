import test from 'node:test';import assert from 'node:assert/strict';
import {bangkokDay,validateQuote,isDue,metrics,message,canCreate} from '../src/domain.mjs';
const q={customer:'สมมติ',title:'เว็บไซต์',sent:'2026-10-23',due:'2026-10-24',status:'pending',amountSatang:19900};
test('Bangkok midnight boundary',()=>{assert.equal(bangkokDay(new Date('2026-10-23T17:00:00Z')),'2026-10-24');assert.equal(bangkokDay(new Date('2026-10-23T16:59:59Z')),'2026-10-23');});
test('due includes today and excludes future/closed',()=>{assert.ok(isDue(q,'2026-10-24'));assert.ok(isDue(q,'2026-10-25'));assert.ok(!isDue(q,'2026-10-23'));for(const status of ['won','lost'])assert.ok(!isDue({...q,status},'2026-10-25'));});
test('input rejects invalid dates amounts and status',()=>{assert.equal(validateQuote(q),q);for(const patch of [{customer:' '},{title:''},{amountSatang:-1},{amountSatang:NaN},{amountSatang:1.2},{due:'2026-02-30'},{due:'2026-10-22'},{status:'paid'}])assert.throws(()=>validateQuote({...q,...patch}));});
test('dashboard money excludes closed quotes',()=>{assert.deepEqual(metrics([q,{...q,status:'won'},{...q,customer:'อื่น',due:'2026-10-30'}],'2026-10-24'),{customers:2,due:1,pending:2,value:39800});assert.equal(metrics([]).value,0);});
test('Thai template preserves user values as text',()=>assert.ok(message(q).includes('สมมติ')));
test('entitlement limits fail closed (domain only, not server enforcement)',()=>{assert.ok(canCreate('free',9));assert.ok(!canCreate('free',10));assert.ok(!canCreate('unknown',0));assert.ok(!canCreate('paid',500));assert.ok(!canCreate('free',-1));});
