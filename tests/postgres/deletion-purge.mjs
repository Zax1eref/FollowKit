import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {deletionReadiness} from '../../src/server/deletion-readiness.mjs';
import {deletionSessionInspector} from '../../src/server/deletion-sessions.mjs';
import {deletionAuth} from '../../src/server/deletion-auth.mjs';
const db=new PGlite(),q=(s,p=[])=>db.query(s,p);
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const tables=['fk_followups','fk_quotes','fk_customers','fk_subscriptions','fk_accounts'];
async function snapshot(owner){const rows=[];for(const t of tables)rows.push((await q(`SELECT * FROM public.${t} WHERE ${t==='fk_accounts'?'id':'account_id'}=$1`,[owner])).rows);rows.push((await q('SELECT * FROM followkit_private.request_dedup WHERE account_id=$1',[owner])).rows);return rows;}
try{
 await db.exec(await readFile(new URL('bootstrap.sql',import.meta.url),'utf8'));
 for(const f of ['001-foundation.sql','002-mutations.sql','003-network-contract.sql','004-account-provisioning.sql'])await db.exec(await readFile(new URL('../../database/postgres/'+f,import.meta.url),'utf8'));
 const dir=new URL('../../supabase/migrations/',import.meta.url);
 for(const f of (await readdir(dir)).filter(f=>/deletion_job_queue|deletion_app_purge/.test(f)).sort())await db.exec(await readFile(new URL(f,dir),'utf8'));
 for(const owner of [A,B]){
  await q('INSERT INTO auth.users(id) VALUES($1)',[owner]);await q('INSERT INTO public.fk_accounts(id) VALUES($1)',[owner]);
  const c=(await q("INSERT INTO public.fk_customers(account_id,name) VALUES($1,'fixture') RETURNING id",[owner])).rows[0].id;
  const quote=(await q("INSERT INTO public.fk_quotes(account_id,customer_id,title,amount_satang,sent_on,due_on) VALUES($1,$2,'fixture',1,'2026-10-27','2026-10-28') RETURNING id",[owner,c])).rows[0].id;
  await q("INSERT INTO public.fk_followups(account_id,quote_id,note,next_due,request_key) VALUES($1,$2,'fixture','2026-10-29','key')",[owner,quote]);
  await q('INSERT INTO public.fk_subscriptions(account_id) VALUES($1)',[owner]);
  await q("INSERT INTO followkit_private.request_dedup(account_id,scope,request_key,payload,response) VALUES($1,'quote','key','{}','{}')",[owner]);
 }
 await q("INSERT INTO followkit_private.payment_events VALUES('fixture','event',now())");
 const id=(await q('INSERT INTO followkit_private.deletion_jobs(subject_id,confirmed_at) VALUES($1,now()) RETURNING id',[A])).rows[0].id;
 const token=(await q('SELECT * FROM followkit_private.claim_deletion_job()')).rows[0].lease_token;
 const purge=()=>q('SELECT followkit_private.purge_deletion_app($1,$2)',[id,token]);
 const ready=deletionReadiness({database:db,leaseToken:token});
 const context={jobId:id,owner:A};
 assert.equal(await ready(context),false);
 const beforeA=await snapshot(A),beforeB=await snapshot(B);
 await assert.rejects(purge,e=>e.code==='42501');
 for(const column of ['archive_verified_at','sessions_revoked_at','billing_settled_at']){await q(`UPDATE followkit_private.deletion_jobs SET ${column}=now() WHERE id=$1`,[id]);await assert.rejects(purge,e=>e.code==='42501');}
 assert.deepEqual(await snapshot(A),beforeA);
 await q("UPDATE public.fk_accounts SET state='deleting' WHERE id=$1",[A]);
 const inspect=deletionSessionInspector({database:db,leaseToken:token});
 await q('INSERT INTO auth.sessions(id,user_id) VALUES(gen_random_uuid(),$1)',[A]);
 assert.deepEqual(await inspect(context),{ready:true,activeSessions:1});
 assert.equal((await inspect({jobId:id,owner:B})).ready,false);
 // Simulate provider revocation in the TEST-ONLY Auth table.
 await q('DELETE FROM auth.sessions WHERE user_id=$1',[A]);
 assert.deepEqual(await inspect(context),{ready:true,activeSessions:0});
 console.log('PASS read-only session inspector verifies job/owner and observes provider session count');

 for(const role of ['anon','authenticated']){await db.exec('SET ROLE '+role);await assert.rejects(purge,e=>e.code==='42501');await db.exec('RESET ROLE');}
 await assert.rejects(()=>q('SELECT followkit_private.purge_deletion_app($1,gen_random_uuid())',[id]),e=>e.code==='42501');
 await q("UPDATE followkit_private.deletion_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[id]);
 await assert.rejects(purge,e=>e.code==='42501');
 await q("UPDATE followkit_private.deletion_jobs SET lease_until=now()+interval '5 minutes' WHERE id=$1",[id]);
 await q("INSERT INTO followkit_private.deletion_ledger(subject_id,state) VALUES($1,'blocked')",[A]);
 console.log('PASS evidence/block/client/lease guards');
 await db.exec("CREATE FUNCTION public.fail_purge() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected'; END$$; CREATE TRIGGER fail_purge BEFORE DELETE ON public.fk_customers FOR EACH ROW EXECUTE FUNCTION public.fail_purge();");
 const blocked=await snapshot(A);await assert.rejects(purge,/injected/);assert.deepEqual(await snapshot(A),blocked);
 assert.equal((await q('SELECT app_purged_at FROM followkit_private.deletion_jobs WHERE id=$1',[id])).rows[0].app_purged_at,null);
 await db.exec('DROP TRIGGER fail_purge ON public.fk_customers');
 console.log('PASS mid-purge failure rolls back earlier table deletes');
 await purge();await purge();assert.deepEqual((await snapshot(A)).map(r=>r.length),[0,0,0,0,0,0]);assert.deepEqual(await snapshot(B),beforeB);
 assert.equal((await q('SELECT * FROM followkit_private.account_tombstones WHERE subject_id=$1',[A])).rows.length,1);
 assert.equal((await q('SELECT * FROM auth.users WHERE id=$1',[A])).rows.length,1);
 assert.equal((await q('SELECT * FROM followkit_private.payment_events')).rows.length,1);
 const j=(await q('SELECT * FROM followkit_private.deletion_jobs WHERE id=$1',[id])).rows[0];assert.ok(j.app_purged_at);assert.equal(j.completed_at,null);
 assert.equal((await q('SELECT * FROM followkit_private.deletion_ledger WHERE subject_id=$1',[A])).rows.length,1);

 assert.equal(await ready(context),true);
 assert.equal(await ready({jobId:id,owner:B}),false);
 for(const column of ['archive_verified_at','sessions_revoked_at','billing_settled_at','app_purged_at']){
  await db.exec('BEGIN');await q(`UPDATE followkit_private.deletion_jobs SET ${column}=NULL WHERE id=$1`,[id]);
  assert.equal(await ready(context),false);await db.exec('ROLLBACK');
 }
 await db.exec('BEGIN');await q('DELETE FROM followkit_private.account_tombstones WHERE subject_id=$1',[A]);assert.equal(await ready(context),false);await db.exec('ROLLBACK');
 await db.exec('BEGIN');await q('INSERT INTO public.fk_accounts(id) VALUES($1)',[A]);assert.equal(await ready(context),false);await db.exec('ROLLBACK');
 let deletes=0;
 const admin={getUserById:async()=>({data:{user:{id:A}},error:null}),deleteUser:async()=>{deletes++;return {error:null}}};
 // Lease changes during provider lookup: second readiness check must stop DELETE.
 admin.getUserById=async()=>{await q('UPDATE followkit_private.deletion_jobs SET lease_token=gen_random_uuid() WHERE id=$1',[id]);return {data:{user:{id:A}},error:null}};
 await assert.rejects(()=>deletionAuth({admin,readiness:ready}).removeIdentity(context),/deletion_identity_pending/);
 assert.equal(deletes,0);assert.equal(await ready(context),false);
 console.log('PASS database readiness rejects missing evidence/resurrected account and fences Auth deletion after lease replacement');
 console.log('PASS all six app tables purged, retry safe; other owner/Auth/job/tombstone/global events preserved');
}finally{await db.close();}
