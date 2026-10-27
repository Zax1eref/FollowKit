// Real PostgreSQL constraints, simulated provider sessions. No live provider calls.
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {deletionWorkflow} from '../../src/server/deletion-workflow.mjs';
const db=new PGlite(),q=(sql,args=[])=>db.query(sql,args);
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
try{
 await db.exec(await readFile(new URL('bootstrap.sql',import.meta.url),'utf8'));
 for(const f of ['001-foundation.sql','002-mutations.sql','003-network-contract.sql','004-account-provisioning.sql'])await db.exec(await readFile(new URL('../../database/postgres/'+f,import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../supabase/migrations/20261027044228_deletion_job_queue.sql',import.meta.url),'utf8'));
 await q('INSERT INTO auth.users(id) VALUES($1),($2)',[owner,other]);
 await q('INSERT INTO public.fk_accounts(id) VALUES($1),($2)',[owner,other]);
 await q("INSERT INTO public.fk_customers(account_id,name) VALUES($1,'fixture'),($2,'other')",[owner,other]);
 await q('INSERT INTO auth.sessions(id,user_id) VALUES(gen_random_uuid(),$1)',[owner]);
 const job=(await q('INSERT INTO followkit_private.deletion_jobs(subject_id,confirmed_at) VALUES($1,now()) RETURNING id',[owner])).rows[0].id;
 await assert.rejects(()=>q('DELETE FROM auth.users WHERE id=$1',[owner]),e=>e.code==='23503');
 console.log('PASS old identity-first ordering hits actual foreign key');
 let failPurge=true,failIdentity=true,identityCalls=0;
 const workflow=deletionWorkflow({
  archive:{retain:async()=>({retained:true})},
  jobs:{loadConfirmed:async()=>({id:job,owner,confirmed:true}),complete:async()=>{
   assert.equal((await q('SELECT id FROM auth.users WHERE id=$1',[owner])).rows.length,0);
   assert.equal((await q('SELECT id FROM public.fk_accounts WHERE id=$1',[owner])).rows.length,0);
   await q('UPDATE followkit_private.deletion_jobs SET completed_at=now() WHERE id=$1',[job]);return {done:true};
  }},
  effects:{
   blockAccess:async()=>{await q('INSERT INTO followkit_private.account_tombstones(subject_id) VALUES($1) ON CONFLICT DO NOTHING',[owner]);await q("UPDATE public.fk_accounts SET state='deleting' WHERE id=$1",[owner]);return {done:true}},
   revokeSessions:async()=>{await q('DELETE FROM auth.sessions WHERE user_id=$1',[owner]);return {done:true}},
   settleBilling:async()=>({done:true}),
   purgeData:async()=>{await db.exec('BEGIN');try{await q('DELETE FROM public.fk_customers WHERE account_id=$1',[owner]);if(failPurge)throw Error('injected');await q('DELETE FROM public.fk_accounts WHERE id=$1',[owner]);await db.exec('COMMIT');return {done:true}}catch(e){await db.exec('ROLLBACK');throw e}},
   removeIdentity:async()=>{identityCalls++;if(failIdentity)throw Error('provider unavailable');await q('DELETE FROM auth.users WHERE id=$1',[owner]);return {done:true}}
  }
 });
 assert.equal((await workflow.run(job)).stage,'purgeData');assert.equal(identityCalls,0);
 assert.equal((await q('SELECT * FROM public.fk_customers WHERE account_id=$1',[owner])).rows.length,1);
 assert.equal((await q('SELECT * FROM auth.sessions WHERE user_id=$1',[owner])).rows.length,0);
 console.log('PASS purge rollback preserves data; sessions revoked; no identity call');
 failPurge=false;assert.equal((await workflow.run(job)).stage,'removeIdentity');
 assert.equal((await q('SELECT * FROM public.fk_accounts WHERE id=$1',[owner])).rows.length,0);
 assert.equal((await q('SELECT * FROM auth.users WHERE id=$1',[owner])).rows.length,1);
 assert.equal((await q('SELECT completed_at FROM followkit_private.deletion_jobs WHERE id=$1',[job])).rows[0].completed_at,null);
 failIdentity=false;assert.deepEqual(await workflow.run(job),{completed:true});
 assert.equal((await q('SELECT * FROM followkit_private.account_tombstones WHERE subject_id=$1',[owner])).rows.length,1);
 assert.equal((await q('SELECT * FROM public.fk_customers WHERE account_id=$1',[other])).rows.length,1);
 console.log('PASS provider failure stays pending; retry completes; tombstone/job and other owner survive');
}finally{await db.close();}
