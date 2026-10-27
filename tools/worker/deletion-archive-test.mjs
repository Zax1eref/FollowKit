import {Miniflare} from 'miniflare';
import assert from 'node:assert/strict';
import {deletionArchive} from '../../src/server/deletion-archive.mjs';
const mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('not_found',{status:404})}}",compatibilityDate:'2026-07-30',r2Buckets:['DELETION_ARCHIVE'],outboundService:()=>{throw Error('Unexpected network');}});
try{
 const bucket=await mf.getR2Bucket('DELETION_ARCHIVE'),subject='11111111-1111-4111-8111-111111111111';
 const archive=deletionArchive({bucket,source:'fixture'});
 await Promise.all(Array.from({length:8},()=>archive.retain(subject)));
 const listed=await bucket.list();assert.equal(listed.objects.length,1);
 const original=await (await bucket.get(listed.objects[0].key)).text();
 assert.equal(await bucket.put(listed.objects[0].key,'overwrite',{onlyIf:{etagDoesNotMatch:'*'}}),null);
 assert.equal(await (await bucket.get(listed.objects[0].key)).text(),original);
 await bucket.put('tombstones/v1/other/'+subject+'.json','{}');
 await assert.rejects(()=>deletionArchive({bucket,source:'other'}).retain(subject),/deletion_archive_conflict/);
 assert.deepEqual(await archive.retain(subject),{retained:true});
 console.log('PASS local R2: concurrent conditional creates converge, overwrite rejected, conflict fails closed, retry verified. No remote bucket accessed.');
}finally{await mf.dispose();}
