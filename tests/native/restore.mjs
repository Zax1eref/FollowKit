// Disposable local CI drill only. Never pass production credentials or external dumps.
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {localAdminUrl} from './config.mjs';
import {deletionSubjects,digest} from './restore-contract.mjs';
let url;
const container=process.env.FOLLOWKIT_RESTORE_CONTAINER;
try {url=localAdminUrl(process.env.FOLLOWKIT_NATIVE_TEST_URL);if(!/^[a-f0-9]{12,64}$/.test(container||''))throw Error();}
catch {console.error('BLOCKED: requires loopback disposable postgres URL and explicit CI container ID.');process.exit(2);}
const tag=randomUUID().replaceAll('-',''),source='fk_backup_'+tag,target='fk_restore_'+tag,role='fk_restore_auth_'+tag,anon='fk_restore_anon_'+tag;
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const freshA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',freshB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const admin=new pg.Client({connectionString:url,connectionTimeoutMillis:5000}),clients=[],databases=[];
let directory,passed=0,ready=false,phase='setup';
const check=async(name,fn)=>{phase=name;await fn();passed++;console.log('PASS '+name);};
async function connect(name){const u=new URL(url);u.pathname='/'+name;const c=new pg.Client({connectionString:u.href,connectionTimeoutMillis:5000});await c.connect();clients.push(c);await c.query("SET statement_timeout='15s'; SET lock_timeout='5s'");return c;}
async function as(c,owner,session=owner){await c.query('RESET ROLE');await c.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[owner,JSON.stringify({sub:owner,session_id:session})]);await c.query('SET ROLE '+role);}
function tool(command,args,input){return execFileSync('docker',['exec','-i',container,command,...args],{input,timeout:60000,maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe']});}
async function reconcile(c,bytes,checkpoint,injectFailure=false){
 ready=false;const subjects=deletionSubjects(bytes,checkpoint);
 await c.query('RESET ROLE');await c.query('BEGIN');
 try {
  await c.query('INSERT INTO followkit_private.account_tombstones(subject_id) SELECT unnest($1::uuid[]) ON CONFLICT DO NOTHING',[subjects]);
  // Union with tombstones already in the snapshot; never remove a retained block.
  for(const table of ['fk_followups','fk_quotes','fk_customers'])await c.query('DELETE FROM public.'+table+' WHERE account_id IN (SELECT subject_id FROM followkit_private.account_tombstones)');
  await c.query('DELETE FROM followkit_private.request_dedup WHERE account_id IN (SELECT subject_id FROM followkit_private.account_tombstones)');
  await c.query('DELETE FROM public.fk_subscriptions WHERE account_id IN (SELECT subject_id FROM followkit_private.account_tombstones)');
  await c.query('DELETE FROM public.fk_accounts WHERE id IN (SELECT subject_id FROM followkit_private.account_tombstones)');
  // TEST-ONLY auth table: production needs a provider-approved session revocation procedure.
  await c.query('DELETE FROM auth.sessions');
  if(injectFailure)throw Error('injected_fixture_failure');
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}
}
try {
 await admin.connect();directory=await mkdtemp(join(tmpdir(),'followkit-restore-'));
 for(const name of [source,target]){await admin.query('CREATE DATABASE '+name);databases.push(name);}
 const from=await connect(source);
 const sql=async path=>(await readFile(new URL(path,import.meta.url),'utf8')).replace(/\bauthenticated\b/g,role).replace(/\banon\b/g,anon);
 await from.query(await sql('../postgres/bootstrap.sql'));
 for(const name of ['001-foundation.sql','002-mutations.sql','003-network-contract.sql','004-account-provisioning.sql'])await from.query(await sql('../../database/postgres/'+name));
 await from.query(await sql('../../supabase/migrations/20261026194730_require_active_session.sql'));
 await from.query('INSERT INTO auth.users(id,email_confirmed_at) VALUES($1,now()),($2,now())',[A,B]);
 await from.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$1),($2,$2)',[A,B]);
 const quotes={};
 for(const id of [A,B]){await as(from,id);await from.query('SELECT public.fk_provision_account(true)');
  quotes[id]=(await from.query("SELECT public.fk_create_quote_scoped('quote-draft','restore-fixture-001','Synthetic quote',100,'2026-10-27','2026-10-28',NULL,'Synthetic customer') q")).rows[0].q;
  await from.query("SELECT public.fk_followup($1,'f1','synthetic note','2026-10-29')",[quotes[id].id]);
 }
 await from.query('RESET ROLE');
 console.log('ENGINE '+(await from.query('SELECT version() v')).rows[0].v);
 console.log(tool('pg_dump',['--version']).toString().trim());
 const dump=tool('pg_dump',['-U','postgres','--format=custom','--dbname='+source]);
 await writeFile(join(directory,'snapshot.dump'),dump,{mode:0o600,flag:'wx'});
 // Deletion happens AFTER the snapshot. This checkpoint lives outside that snapshot.
 await from.query("INSERT INTO followkit_private.deletion_ledger(subject_id,state) VALUES($1,'requested')",[A]);
 const subjects=(await from.query('SELECT subject_id FROM followkit_private.account_tombstones ORDER BY subject_id')).rows.map(r=>r.subject_id);
 const manifest=Buffer.from(JSON.stringify({format:'followkit-deletion-fixture-v1',source,sequence:1,subjects}));
 const checkpoint={source,sequence:1,sha256:digest(manifest)};
 await writeFile(join(directory,'retained-deletions.json'),manifest,{mode:0o600,flag:'wx'});
 tool('pg_restore',['-U','postgres','--exit-on-error','--single-transaction','--dbname='+target],await readFile(join(directory,'snapshot.dump')));
 const restored=await connect(target);
 await check('real dump/restore preserves data and demonstrates stale deleted-account access offline',async()=>{
  assert.ok(dump.length>1000);
  for(const table of ['fk_accounts','fk_customers','fk_quotes','fk_followups','fk_subscriptions'])assert.equal((await restored.query('SELECT count(*)::int n FROM public.'+table)).rows[0].n,2);
  assert.equal((await restored.query('SELECT count(*)::int n FROM followkit_private.account_tombstones')).rows[0].n,0);
  await as(restored,A);assert.equal((await restored.query('SELECT * FROM public.fk_quotes')).rows[0].id,quotes[A].id);assert.equal(ready,false);
 });
 await check('missing stale wrong-source and tampered deletion checkpoints fail closed',async()=>{
  for(const [bytes,expected] of [[null,checkpoint],[manifest,{...checkpoint,sequence:2}],[manifest,{...checkpoint,source:'wrong'}],[Buffer.from('{}'),checkpoint]])await assert.rejects(()=>reconcile(restored,bytes,expected),/invalid_deletion_checkpoint/);
  assert.equal(ready,false);
 });
 await check('failed reconciliation rolls back purge and session changes without opening the target',async()=>{
  await assert.rejects(()=>reconcile(restored,manifest,checkpoint,true),/injected_fixture_failure/);
  assert.equal((await restored.query('SELECT count(*)::int n FROM public.fk_accounts')).rows[0].n,2);
  assert.equal((await restored.query('SELECT count(*)::int n FROM auth.sessions')).rows[0].n,2);
  assert.equal((await restored.query('SELECT count(*)::int n FROM followkit_private.account_tombstones')).rows[0].n,0);assert.equal(ready,false);
 });
 await check('reconciliation is repeatable and purges deleted account data plus all restored sessions',async()=>{
  const external=await readFile(join(directory,'retained-deletions.json'));
  await reconcile(restored,external,checkpoint);await reconcile(restored,external,checkpoint);
  for(const table of ['fk_accounts','fk_customers','fk_quotes','fk_followups','fk_subscriptions'])assert.equal((await restored.query('SELECT count(*)::int n FROM public.'+table)).rows[0].n,1);
  assert.equal((await restored.query('SELECT count(*)::int n FROM followkit_private.request_dedup')).rows[0].n,1);
  assert.deepEqual((await restored.query('SELECT subject_id FROM followkit_private.account_tombstones')).rows.map(r=>r.subject_id),[A]);
  assert.equal((await restored.query('SELECT count(*)::int n FROM auth.sessions')).rows[0].n,0);
 });
 await check('both restored old sessions are rejected before any user can reopen data',async()=>{
  for(const id of [A,B]){await as(restored,id);await assert.rejects(()=>restored.query('SELECT followkit_private.active_owner()'),e=>e.code==='42501');await assert.rejects(()=>restored.query("SELECT public.fk_save_customer('blocked')"),e=>e.code==='42501');}
 });
 await check('fresh login cannot revive deleted account while retained account keeps records and retry history',async()=>{
  await restored.query('RESET ROLE');await restored.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2),($3,$4)',[freshA,A,freshB,B]);
  await as(restored,A,freshA);assert.equal((await restored.query('SELECT * FROM public.fk_accounts')).rows.length,0);
  await assert.rejects(()=>restored.query('SELECT public.fk_provision_account(true)'),/account_blocked/);
  await assert.rejects(()=>restored.query("SELECT public.fk_save_customer('blocked')"),e=>e.code==='42501');
  await as(restored,B,freshB);assert.equal((await restored.query('SELECT * FROM public.fk_quotes')).rows[0].id,quotes[B].id);
  const replay=(await restored.query("SELECT public.fk_create_quote_scoped('quote-draft','restore-fixture-001','Synthetic quote',100,'2026-10-27','2026-10-28',NULL,'Synthetic customer') q")).rows[0].q;
  assert.equal(replay.id,quotes[B].id);assert.equal(replay.replayed,true);
 });
 await check('restored RLS and private-table permissions remain enforced',async()=>{
  await assert.rejects(()=>restored.query('SELECT * FROM followkit_private.account_tombstones'),/permission denied/);
  await assert.rejects(()=>restored.query('SELECT * FROM auth.sessions'),/permission denied/);
  await restored.query('RESET ROLE');
  const rows=(await restored.query("SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND (n.nspname='followkit_private' OR (n.nspname='public' AND c.relname LIKE 'fk_%'))")).rows;
  assert.equal(rows.length,9);assert.ok(rows.every(r=>r.relrowsecurity));ready=true;
 });
 console.log(`RESULT ${passed}/7 native restore groups; isolated fixture candidate verified=${ready}. No live Supabase restore or production deletion authority configured.`);
}catch {console.error('FAIL restore drill at '+phase+'; no target is released to traffic.');process.exitCode=1;}
finally {
 for(const c of clients)await c.end().catch(()=>{});
 for(const name of databases.reverse())await admin.query('DROP DATABASE '+name+' WITH (FORCE)').catch(()=>{console.error('Cleanup failed: '+name);process.exitCode=1;});
 for(const name of [role,anon])await admin.query('DROP ROLE IF EXISTS '+name).catch(()=>{console.error('Cleanup failed: '+name);process.exitCode=1;});
 await admin.end().catch(()=>{});if(directory)await rm(directory,{recursive:true,force:true});
}
