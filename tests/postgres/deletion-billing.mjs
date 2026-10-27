import {PGlite} from '@electric-sql/pglite';import {readFile,readdir} from 'node:fs/promises';import assert from 'node:assert/strict';
import {deletionFreeBilling} from '../../src/server/deletion-billing.mjs';
const db=new PGlite(),q=(s,p=[])=>db.query(s,p),owner='11111111-1111-4111-8111-111111111111';
try{
 await db.exec(await readFile(new URL('bootstrap.sql',import.meta.url),'utf8'));
 for(const f of ['001-foundation.sql','002-mutations.sql','003-network-contract.sql','004-account-provisioning.sql'])await db.exec(await readFile(new URL('../../database/postgres/'+f,import.meta.url),'utf8'));
 const dir=new URL('../../supabase/migrations/',import.meta.url);
 for(const f of (await readdir(dir)).filter(f=>/deletion_job_queue|deletion_app_purge|deletion_free_billing/.test(f)).sort())await db.exec(await readFile(new URL(f,dir),'utf8'));
 await q('INSERT INTO auth.users(id) VALUES($1)',[owner]);await q('INSERT INTO public.fk_accounts(id) VALUES($1)',[owner]);await q('INSERT INTO public.fk_subscriptions(account_id) VALUES($1)',[owner]);
 const jobId=(await q('INSERT INTO followkit_private.deletion_jobs(subject_id,confirmed_at,archive_verified_at,sessions_revoked_at) VALUES($1,now(),now(),now()) RETURNING id',[owner])).rows[0].id;
 const leaseToken=(await q('SELECT * FROM followkit_private.claim_deletion_job()')).rows[0].lease_token;
 assert.throws(()=>deletionFreeBilling({database:db,leaseToken}),/invalid/);
 const settle=deletionFreeBilling({database:db,leaseToken,billingMode:'no_provider_ever_enabled'}),context={jobId,owner};
 await assert.rejects(()=>settle(context),/pending/);await q("UPDATE public.fk_accounts SET state='deleting' WHERE id=$1",[owner]);
 for(const sql of ["UPDATE public.fk_accounts SET plan='paid'",...['trialing','active','past_due','canceled','expired'].map(s=>`UPDATE public.fk_subscriptions SET status='${s}'`),"UPDATE public.fk_subscriptions SET provider_customer_id='provider-fixture'","UPDATE public.fk_subscriptions SET current_period_end=now()","DELETE FROM public.fk_subscriptions"]){await db.exec('BEGIN');await db.exec(sql);await assert.rejects(()=>settle(context),/pending/);await db.exec('ROLLBACK');assert.equal((await q('SELECT billing_settled_at FROM followkit_private.deletion_jobs')).rows[0].billing_settled_at,null);}
 console.log('PASS paid/provider/unknown states cannot produce billing evidence');
 for(const role of ['anon','authenticated']){await db.exec('SET ROLE '+role);await assert.rejects(()=>settle(context),/pending/);await db.exec('RESET ROLE');}
 assert.deepEqual(await settle(context),{done:true});assert.deepEqual(await settle(context),{done:true});
 assert.equal((await q('SELECT billing_basis FROM followkit_private.deletion_jobs')).rows[0].billing_basis,'free_no_provider');
 await q('SELECT followkit_private.purge_deletion_app($1,$2)',[jobId,leaseToken]);assert.deepEqual(await settle(context),{done:true});
 console.log('PASS client denial, verified free evidence, repeat and post-purge recovery');
}finally{await db.close();}
