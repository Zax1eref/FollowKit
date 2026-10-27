import {PGlite} from '@electric-sql/pglite';import {readFile,readdir} from 'node:fs/promises';import assert from 'node:assert/strict';
const db=new PGlite(),q=(s,p=[])=>db.query(s,p),A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',S='33333333-3333-4333-8333-333333333333';
try{
 await db.exec(await readFile(new URL('bootstrap.sql',import.meta.url),'utf8'));
 for(const f of ['001-foundation.sql','002-mutations.sql','003-network-contract.sql','004-account-provisioning.sql'])await db.exec(await readFile(new URL('../../database/postgres/'+f,import.meta.url),'utf8'));
 const dir=new URL('../../supabase/migrations/',import.meta.url);for(const f of (await readdir(dir)).filter(f=>/deletion_job_queue|deletion_admission/.test(f)).sort())await db.exec(await readFile(new URL(f,dir),'utf8'));
 await q('INSERT INTO auth.users(id,email_confirmed_at) VALUES($1,now()),($2,now())',[A,B]);await q('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[S,A]);await q('INSERT INTO public.fk_accounts(id) VALUES($1),($2)',[A,B]);
 const admit=()=>q('SELECT followkit_private.admit_deletion($1,$2,clock_timestamp()) id',[A,S]);
 for(const role of ['anon','authenticated']){await db.exec('SET ROLE '+role);await assert.rejects(admit,e=>e.code==='42501');await db.exec('RESET ROLE');}
 await assert.rejects(()=>q('SELECT followkit_private.admit_deletion($1,$2,now())',[B,S]),e=>e.code==='42501');
 await assert.rejects(()=>q("SELECT followkit_private.admit_deletion($1,$2,now()-interval '6 minutes')",[A,S]),e=>e.code==='42501');
 assert.equal((await q('SELECT * FROM followkit_private.deletion_jobs')).rows.length,0);
 console.log('PASS client denial, foreign session and stale authentication rejection');
 await db.exec('BEGIN');await admit();await db.exec('ROLLBACK');
 assert.equal((await q('SELECT * FROM followkit_private.deletion_jobs')).rows.length,0);assert.equal((await q('SELECT * FROM followkit_private.account_tombstones')).rows.length,0);
 const first=(await admit()).rows[0].id;assert.equal((await admit()).rows[0].id,first);
 assert.equal((await q('SELECT * FROM followkit_private.deletion_jobs')).rows.length,1);
 assert.equal((await q('SELECT state FROM public.fk_accounts WHERE id=$1',[A])).rows[0].state,'deleting');
 assert.equal((await q('SELECT state FROM public.fk_accounts WHERE id=$1',[B])).rows[0].state,'active');
 await q('DELETE FROM auth.sessions WHERE id=$1',[S]);await assert.rejects(admit,e=>e.code==='42501');
 console.log('PASS atomic job/block/tombstone rollback, repeat deduplication and revoked session denial');
}finally{await db.close();}
