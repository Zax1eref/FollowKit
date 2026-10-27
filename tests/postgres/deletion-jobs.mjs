import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite(),q=(s,p=[])=>db.query(s,p);
const owner='11111111-1111-4111-8111-111111111111';
try{
 await db.exec(await readFile(new URL('bootstrap.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../database/postgres/001-foundation.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../supabase/migrations/20261027044228_deletion_job_queue.sql',import.meta.url),'utf8'));
 const job=(await q('INSERT INTO followkit_private.deletion_jobs(subject_id,confirmed_at) VALUES($1,now()) RETURNING *',[owner])).rows[0];
 await assert.rejects(()=>q('INSERT INTO followkit_private.deletion_jobs(subject_id,confirmed_at) VALUES($1,now())',[owner]),e=>e.code==='23505');
 for(const role of ['anon','authenticated']){
  await db.exec('SET ROLE '+role);
  for(const sql of ['SELECT * FROM followkit_private.deletion_jobs','SELECT * FROM followkit_private.claim_deletion_job()',"INSERT INTO followkit_private.deletion_jobs(subject_id,confirmed_at) VALUES('11111111-1111-4111-8111-111111111111',now())"])
   await assert.rejects(()=>q(sql),e=>e.code==='42501');
  await db.exec('RESET ROLE');
 }
 console.log('PASS private grants and owner deduplication');
 const first=(await q('SELECT * FROM followkit_private.claim_deletion_job()')).rows[0];
 assert.equal(first.id,job.id);assert.equal(first.attempts,1);
 assert.equal((await q('SELECT * FROM followkit_private.claim_deletion_job()')).rows.length,0);
 await q("UPDATE followkit_private.deletion_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[job.id]);
 const second=(await q('SELECT * FROM followkit_private.claim_deletion_job()')).rows[0];
 assert.notEqual(second.lease_token,first.lease_token);assert.equal(second.attempts,2);
 assert.equal((await q("SELECT followkit_private.retry_deletion_job($1,$2,'archive') ok",[job.id,first.lease_token])).rows[0].ok,false);
 assert.equal((await q("SELECT followkit_private.retry_deletion_job($1,$2,'archive') ok",[job.id,second.lease_token])).rows[0].ok,true);
 assert.equal((await q('SELECT * FROM followkit_private.claim_deletion_job()')).rows.length,0);
 console.log('PASS lease expiry recovery, stale token fencing and retry delay');
 await assert.rejects(()=>q("UPDATE followkit_private.deletion_jobs SET subject_id=gen_random_uuid() WHERE id=$1",[job.id]),e=>e.code==='23514');
 await q('UPDATE followkit_private.deletion_jobs SET completed_at=now() WHERE id=$1',[job.id]);
 await assert.rejects(()=>q('UPDATE followkit_private.deletion_jobs SET completed_at=NULL WHERE id=$1',[job.id]),e=>e.code==='23514');
 assert.equal((await q('SELECT * FROM followkit_private.claim_deletion_job()')).rows.length,0);
 assert.equal((await q("SELECT count(*)::int n FROM pg_constraint WHERE conrelid='followkit_private.deletion_jobs'::regclass AND contype='f'")).rows[0].n,0);
 console.log('PASS immutable identity/completion and no account/Auth cascade dependency');
}finally{await db.close();}
