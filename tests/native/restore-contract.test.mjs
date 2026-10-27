import test from 'node:test';
import assert from 'node:assert/strict';
import {deletionSubjects,digest} from './restore-contract.mjs';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const manifest={format:'followkit-deletion-fixture-v1',source:'fixture-source',sequence:2,subjects:[id,id.toUpperCase()]};
const bytes=Buffer.from(JSON.stringify(manifest));
const checkpoint={source:manifest.source,sequence:2,sha256:digest(bytes)};
test('retained deletion checkpoint normalizes UUIDs and deduplicates subjects',()=>{
 assert.deepEqual(deletionSubjects(bytes,checkpoint),[id]);
});
test('missing stale wrong-source malformed and tampered checkpoints fail closed',()=>{
 for(const [data,expected] of [[null,checkpoint],[bytes,null],[bytes,{...checkpoint,sequence:3}],[bytes,{...checkpoint,source:'other'}],[Buffer.from('{}'),checkpoint]])assert.throws(()=>deletionSubjects(data,expected),/invalid_deletion_checkpoint/);
 for(const change of [{sequence:0},{sequence:1.5},{subjects:['not-a-uuid']},{subjects:null},{format:'other'}]){
  const data=Buffer.from(JSON.stringify({...manifest,...change}));
  assert.throws(()=>deletionSubjects(data,{...checkpoint,sha256:digest(data)}),/invalid_deletion_checkpoint/);
 }
});
test('oversized manifest is rejected without echoing submitted values',()=>{
 const data=Buffer.from('DO_NOT_LOG'.repeat(7000));
 assert.throws(()=>deletionSubjects(data,{...checkpoint,sha256:digest(data)}),e=>!e.message.includes('DO_NOT_LOG'));
});
