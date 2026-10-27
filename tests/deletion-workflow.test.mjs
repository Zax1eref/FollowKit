import test from 'node:test';
import assert from 'node:assert/strict';
import {deletionWorkflow} from '../src/server/deletion-workflow.mjs';
const id='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222';
function fixture(failure){
 const calls=[]; const effect=name=>async context=>{assert.deepEqual(context,{jobId:id,owner});calls.push(name);if(name===failure)throw Error('secret provider error');return {done:true}};
 const jobs={loadConfirmed:async jobId=>{assert.equal(jobId,id);return {id,owner,confirmed:true}},complete:effect('complete')};
 const archive={retain:async subject=>{assert.equal(subject,owner);calls.push('archive');if(failure==='archive')throw Error('secret');return {retained:true}}};
 const effects=Object.fromEntries(['blockAccess','revokeSessions','settleBilling','purgeData','removeIdentity'].map(x=>[x,effect(x)]));
 return {calls,jobs,archive,effects,run:()=>deletionWorkflow({jobs,archive,effects}).run(id)};
}
test('archive acknowledgement precedes all destructive effects and completion',async()=>{const f=fixture();assert.deepEqual(await f.run(),{completed:true});assert.deepEqual(f.calls,['archive','blockAccess','revokeSessions','settleBilling','purgeData','removeIdentity','complete'])});
test('unconfirmed or mismatched job cannot write an irreversible archive marker',async()=>{for(const job of [null,{id,owner,confirmed:false},{id:owner,owner,confirmed:true},{id,owner:'bad',confirmed:true}]){const f=fixture();f.jobs.loadConfirmed=async()=>job;assert.equal((await f.run()).stage,'load_confirmed');assert.deepEqual(f.calls,[])}});
test('archive outage and false acknowledgement prevent every later effect',async()=>{for(const result of [null,{}, {retained:false}]){const f=fixture();f.archive.retain=async()=>result;assert.deepEqual(await f.run(),{completed:false,pending:true,stage:'archive'});assert.deepEqual(f.calls,[])}const f=fixture('archive');assert.equal((await f.run()).completed,false);assert.deepEqual(f.calls,['archive'])});
test('each downstream failure stays pending and never executes a later step',async()=>{const order=['archive','blockAccess','revokeSessions','settleBilling','purgeData','removeIdentity','complete'];for(const stage of order){const f=fixture(stage);assert.deepEqual(await f.run(),{completed:false,pending:true,stage});assert.deepEqual(f.calls,order.slice(0,order.indexOf(stage)+1))}});
test('retry rereads confirmed job and archive; never skips unfinished work',async()=>{const f=fixture();let first=true;const original=f.effects.removeIdentity;f.effects.removeIdentity=async c=>{if(first){first=false;throw Error('lost acknowledgement')}return original(c)};assert.equal((await f.run()).stage,'removeIdentity');assert.deepEqual(await f.run(),{completed:true});assert.equal(f.calls.filter(x=>x==='archive').length,2);assert.equal(f.calls.filter(x=>x==='complete').length,1)});
test('false success from effect or completion cannot be reported as completed',async()=>{for(const stage of ['blockAccess','revokeSessions','settleBilling','purgeData','removeIdentity','complete']){const f=fixture();(stage==='complete'?f.jobs:f.effects)[stage]=async()=>({done:false});assert.deepEqual(await f.run(),{completed:false,pending:true,stage})}});
