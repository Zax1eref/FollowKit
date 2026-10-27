import {PGlite} from '@electric-sql/pglite';import {readFile,readdir} from 'node:fs/promises';import assert from 'node:assert/strict';import {deletionService} from '../../src/server/deletion-service.mjs';
const db=new PGlite(),q=(s,p=[])=>db.query(s,p),A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',S='33333333-3333-4333-8333-333333333333',issuer='https://fixture.supabase.co/auth/v1';
try{
 await db.exec(await readFile(new URL('bootstrap.sql',import.meta.url),'utf8'));
 for(const f of ['001-foundation.sql','002-mutations.sql','003-network-contract.sql','004-account-provisioning.sql'])await db.exec(await readFile(new URL('../../database/postgres/'+f,import.meta.url),'utf8'));
 const candidate=await readFile(new URL('../../supabase/migrations/20261027100318_deletion_executor_role.sql',import.meta.url),'utf8');
 await db.exec('CREATE ROLE fixture_installer NOLOGIN NOSUPERUSER NOBYPASSRLS; SET ROLE fixture_installer');
 await assert.rejects(()=>db.exec(candidate),e=>e.code==='42501'&&e.message.includes('deletion_executor_auth_policy_owner_required'));
 await db.exec('ROLLBACK; RESET ROLE');
 assert.equal((await q("SELECT 1 FROM pg_roles WHERE rolname='followkit_deletion_executor'")).rows.length,0);
 console.log('PASS installer without managed Auth ownership fails before executor creation');
 const dir=new URL('../../supabase/migrations/',import.meta.url);for(const f of (await readdir(dir)).filter(f=>/deletion_job_queue|deletion_app_purge|deletion_completion|deletion_free_billing|deletion_admission|deletion_executor_role/.test(f)).sort())await db.exec(await readFile(new URL(f,dir),'utf8'));
 for(const owner of [A,B]){await q('INSERT INTO auth.users(id,email_confirmed_at) VALUES($1,now())',[owner]);await q('INSERT INTO public.fk_accounts(id) VALUES($1)',[owner]);await q('INSERT INTO public.fk_subscriptions(account_id) VALUES($1)',[owner]);await q("INSERT INTO public.fk_customers(account_id,name) VALUES($1,'fixture')",[owner]);}
 await q('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[S,A]);
 const user={id:A,email_confirmed_at:'2026-10-27',is_anonymous:false};let archiveFails=true,providerFails=true,logoutCalls=0;const archived=new Set();
 const auth={getClaims:async()=>({data:{claims:{iss:issuer,sub:A,session_id:S,aud:'authenticated',role:'authenticated',is_anonymous:false,exp:Math.floor(Date.now()/1000)+3600,amr:[{method:'password',timestamp:Math.floor(Date.now()/1000)}]}}}),getUser:async()=>({data:{user}}),admin:{
  signOut:async()=>{logoutCalls++;if(providerFails)throw Error('provider fixture failure');await q('DELETE FROM auth.sessions WHERE user_id=$1',[A]);return {error:null}},
  getUserById:async id=>{const r=await q('SELECT id FROM auth.users WHERE id=$1',[id]);return r.rows.length?{data:{user:{id}}}:{data:{user:null},error:{status:404,code:'user_not_found'}}},
  deleteUser:async id=>{await q('DELETE FROM auth.users WHERE id=$1',[id]);return {error:null}}
 }};
 await db.exec('ALTER TABLE auth.users ADD COLUMN email text; ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY; ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY');
 const attrs=(await q("SELECT rolcanlogin,rolsuper,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname='followkit_deletion_executor'")).rows[0];
 assert.deepEqual(attrs,{rolcanlogin:false,rolsuper:false,rolbypassrls:false,rolcreaterole:false});
 assert.equal((await q("SELECT pg_has_role('authenticated','followkit_deletion_executor','MEMBER') m")).rows[0].m,false);
 const executor={query:async(sql,args)=>{await db.exec('SET ROLE followkit_deletion_executor');try{return await q(sql,args)}finally{await db.exec('RESET ROLE')}}};
 await db.exec('SET ROLE followkit_deletion_executor');
 for(const sql of ['DELETE FROM auth.users','DELETE FROM auth.sessions','SELECT email FROM auth.users','DELETE FROM followkit_private.account_tombstones','DELETE FROM followkit_private.deletion_jobs','SELECT * FROM followkit_private.payment_events',"UPDATE public.fk_accounts SET plan='paid'","UPDATE public.fk_subscriptions SET status='active'"]){await assert.rejects(()=>q(sql),e=>e.code==='42501');}
 assert.equal((await q('DELETE FROM public.fk_customers RETURNING account_id')).rows.length,0);
 await db.exec('RESET ROLE');
 console.log('PASS non-bypass executor denies Auth writes, retained-authority deletion, plan/billing edits and unready purge');
 const service=deletionService({database:executor,auth,issuer,billingMode:'no_provider_ever_enabled',archive:{retain:async owner=>{if(archiveFails)throw Error('outage');archived.add(owner);return {retained:true}}}});
 const input={accessToken:'fixture-token',body:{confirmation:'DELETE MY ACCOUNT'}};
 const accepted=await service.confirm(input);assert.equal(accepted.accepted,true);assert.equal(logoutCalls,0);
 let job=(await q('SELECT * FROM followkit_private.deletion_jobs')).rows[0];assert.equal(job.last_failure,'archive');assert.equal(job.archive_verified_at,null);assert.equal(job.lease_token,null);
 assert.equal((await q('SELECT * FROM public.fk_customers WHERE account_id=$1',[A])).rows.length,1);
 console.log('PASS composed admission blocks access; archive failure preserves data and schedules retry');
 const due=()=>q("UPDATE followkit_private.deletion_jobs SET next_attempt_at=now()-interval '1 second'");
 archiveFails=false;await due();await service.confirm(input);job=(await q('SELECT * FROM followkit_private.deletion_jobs')).rows[0];assert.equal(job.last_failure,'revokeSessions');assert.ok(job.archive_verified_at);assert.equal(job.sessions_revoked_at,null);
 await due();const noToken=await service.runNext();assert.equal(noToken.stage,'revokeSessions');assert.equal(noToken.retryScheduled,true);
 console.log('PASS provider outage and tokenless background retry cannot bypass session revocation');
 providerFails=false;await due();assert.equal((await service.confirm(input)).jobId,accepted.jobId);
 job=(await q('SELECT * FROM followkit_private.deletion_jobs')).rows[0];assert.ok(job.completed_at);assert.ok(job.app_purged_at);assert.equal(job.billing_basis,'free_no_provider');assert.equal(job.lease_token,null);
 for(const table of ['fk_accounts','fk_customers','fk_subscriptions'])assert.equal((await q(`SELECT * FROM public.${table} WHERE ${table==='fk_accounts'?'id':'account_id'}=$1`,[A])).rows.length,0);
 assert.equal((await q('SELECT * FROM auth.users WHERE id=$1',[A])).rows.length,0);assert.equal((await q('SELECT * FROM auth.sessions WHERE user_id=$1',[A])).rows.length,0);
 assert.equal((await q('SELECT * FROM public.fk_customers WHERE account_id=$1',[B])).rows.length,1);assert.ok(archived.has(A));assert.ok(!archived.has(B));
 assert.equal((await q('SELECT * FROM followkit_private.account_tombstones WHERE subject_id=$1',[A])).rows.length,1);
 assert.deepEqual(await service.runNext(),{idle:true});
 console.log('PASS all composed stages complete on retry, preserve B and retained authority, and leave no runnable job');
}finally{await db.close();}
