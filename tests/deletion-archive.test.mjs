import test from 'node:test';import assert from 'node:assert/strict';
import {deletionArchive} from '../src/server/deletion-archive.mjs';
const subject='11111111-1111-4111-8111-111111111111';
function fixture({failPut=false,lostAck=false}={}){const rows=new Map();let puts=0;return {rows,get puts(){return puts;},async get(key){const body=rows.get(key);return body===undefined?null:{size:new TextEncoder().encode(body).length,body:new Response(body).body};},async put(key,body,options){puts++;assert.equal(options.onlyIf.etagDoesNotMatch,'*');if(failPut)throw Error('provider secret');if(rows.has(key))return null;rows.set(key,body);if(lostAck)throw Error('lost acknowledgement');return {key};}};}
test('archive retains minimal canonical tombstone and retries without overwriting',async()=>{
 const bucket=fixture(),archive=deletionArchive({bucket,source:'fixture'});
 assert.deepEqual(await archive.retain(subject),{retained:true});await archive.retain(subject.toUpperCase());assert.equal(bucket.puts,1);
 assert.deepEqual(JSON.parse([...bucket.rows.values()][0]),{version:1,source:'fixture',subject,action:'deny_restore'});
});
test('lost storage acknowledgement succeeds only when exact retained bytes can be read',async()=>{
 assert.deepEqual(await deletionArchive({bucket:fixture({lostAck:true}),source:'fixture'}).retain(subject),{retained:true});
 await assert.rejects(()=>deletionArchive({bucket:fixture({failPut:true}),source:'fixture'}).retain(subject),e=>e.message==='deletion_archive_unavailable'&&!e.message.includes('secret'));
});
test('conflicting existing object is not overwritten or acknowledged',async()=>{
 const bucket=fixture();bucket.rows.set(`tombstones/v1/fixture/${subject}.json`,'{}');
 await assert.rejects(()=>deletionArchive({bucket,source:'fixture'}).retain(subject),/deletion_archive_conflict/);assert.equal(bucket.puts,0);
});
test('invalid configuration and subject fail before storage access',async()=>{
 const bucket=fixture();for(const source of ['', '../other', 'UPPER'])assert.throws(()=>deletionArchive({bucket,source}),/invalid_deletion_archive_configuration/);
 await assert.rejects(()=>deletionArchive({bucket,source:'fixture'}).retain('../escape'),/invalid_deletion_subject/);assert.equal(bucket.puts,0);
});
test('oversized reads and stalled storage never return a durable acknowledgement',async()=>{
 const bucket=fixture();bucket.rows.set(`tombstones/v1/fixture/${subject}.json`,'x'.repeat(4097));
 await assert.rejects(()=>deletionArchive({bucket,source:'fixture'}).retain(subject),/deletion_archive_unavailable/);
 await assert.rejects(()=>deletionArchive({bucket:{get:()=>new Promise(()=>{}),put:async()=>{}},source:'fixture',timeoutMs:5}).retain(subject),/deletion_archive_unavailable/);
});
