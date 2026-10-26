import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite(); let passed = 0;
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
const SA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', SA2='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', SB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const q=(sql,args=[])=>db.query(sql,args);
async function as(owner,session){await db.exec('RESET ROLE');await q("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[owner??'',JSON.stringify(session===undefined?{}:{session_id:session})]);await db.exec('SET ROLE authenticated');}
async function check(name,fn){await fn();passed++;console.log('PASS '+name);}
const denied=(sql,args=[])=>assert.rejects(()=>q(sql,args),e=>e.code==='42501'&&e.message==='unauthorized');
try {
 await db.exec(await readFile(new URL('bootstrap.sql',import.meta.url),'utf8'));
 for(const file of ['001-foundation.sql','002-mutations.sql','003-network-contract.sql','004-account-provisioning.sql'])await db.exec(await readFile(new URL('../../database/postgres/'+file,import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../supabase/migrations/20261026194730_require_active_session.sql',import.meta.url),'utf8'));
 await q('INSERT INTO auth.users(id,email_confirmed_at) VALUES($1,now()),($2,now())',[A,B]);
 await q('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2),($3,$2),($4,$5)',[SA,A,SA2,SB,B]);
 let customer,quote;
 await check('valid sessions provision and perform ordinary reads and mutations',async()=>{
  await as(A,SA);await q('SELECT public.fk_provision_account(true)');
  customer=(await q("SELECT to_jsonb(public.fk_save_customer('session fixture')) c")).rows[0].c.id;
  quote=(await q("SELECT public.fk_create_quote_scoped('quote','session-test-key01','Fixture',1,'2026-10-27','2026-10-28',$1) q",[customer])).rows[0].q.id;
  await q("SELECT public.fk_followup($1,'f1','note','2026-10-29')",[quote]);
  for(const table of ['fk_accounts','fk_customers','fk_quotes','fk_followups','fk_subscriptions'])assert.equal((await q('SELECT * FROM public.'+table)).rows.length,1);
 });
 await check('missing malformed nonexistent and another-user session IDs fail closed',async()=>{
  for(const session of [undefined,null,'bad',SB,'cccccccc-cccc-4ccc-8ccc-cccccccccccc']){
   await as(A,session);await denied('SELECT followkit_private.active_owner()');await denied('SELECT public.fk_onboarding_status()');await denied("SELECT public.fk_save_customer('denied')");
  }
 });
 await check('clients cannot query auth.sessions or execute the private session helper',async()=>{
  await as(A,SA);for(const sql of ['SELECT * FROM auth.sessions','SELECT followkit_private.session_owner()'])await assert.rejects(()=>q(sql),/permission denied/);
 });
 await check('removing one session blocks its five table reads and all public RPC entry points',async()=>{
  await db.exec('RESET ROLE');await q('DELETE FROM auth.sessions WHERE id=$1',[SA]);await as(A,SA);
  for(const table of ['fk_accounts','fk_customers','fk_quotes','fk_followups','fk_subscriptions'])await denied('SELECT * FROM public.'+table);
  const calls=[
   ['SELECT public.fk_onboarding_status()',[]],['SELECT public.fk_provision_account(true)',[]],
   ["SELECT public.fk_save_customer('bad')",[]],['SELECT public.fk_delete_customer($1)',[customer]],
   ["SELECT public.fk_create_quote('revoked-test-key1','bad',1,'2026-10-27','2026-10-28',$1)",[customer]],
   ["SELECT public.fk_create_quote_scoped('quote','revoked-test-key2','bad',1,'2026-10-27','2026-10-28',$1)",[customer]],
   ["SELECT public.fk_update_quote($1,'bad',1,'2026-10-27','2026-10-28','won')",[quote]],
   ["SELECT public.fk_patch_quote($1,'{}'::jsonb)",[quote]],['SELECT public.fk_delete_quote($1)',[quote]],
   ["SELECT public.fk_followup($1,'bad','bad','2026-10-29')",[quote]],
   ["SELECT public.fk_dashboard('2026-10-27')",[]],['SELECT public.fk_followups_json($1)',[quote]],['SELECT public.fk_export_account()',[]]
  ];
  for(const [sql,args] of calls)await denied(sql,args);
 });
 await check('another active session and another account remain valid and isolated',async()=>{
  await as(A,SA2);assert.equal((await q('SELECT * FROM public.fk_quotes')).rows.length,1);
  await as(B,SB);await q('SELECT public.fk_provision_account(true)');assert.equal((await q('SELECT * FROM public.fk_quotes')).rows.length,0);
  await assert.rejects(()=>q('SELECT public.fk_delete_quote($1)',[quote]),/not_found/);
 });
 await check('not_after expiry blocks a session that still exists',async()=>{
  await db.exec('RESET ROLE');await q("UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id=$1",[SA2]);
  await as(A,SA2);await denied('SELECT followkit_private.active_owner()');
 });
 await check('session validation does not bypass retained account tombstones',async()=>{
  await db.exec('RESET ROLE');await q("INSERT INTO followkit_private.deletion_ledger(subject_id,state) VALUES($1,'requested')",[B]);
  await as(B,SB);assert.equal((await q('SELECT * FROM public.fk_accounts')).rows.length,0);await assert.rejects(()=>q('SELECT public.fk_provision_account(true)'),/account_blocked/);
 });
 console.log(`RESULT ${passed}/7 session-revocation groups; actual PostgreSQL WASM with simulated provider sessions.`);
} catch(e){console.error('FAIL '+e.message);process.exitCode=1;}finally{await db.close();}
