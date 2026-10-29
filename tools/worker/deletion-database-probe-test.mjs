import {Miniflare} from 'miniflare';import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
if(!process.argv[2])throw Error('Pass the Wrangler dry-run database-probe.js path');
const script=await readFile(process.argv[2],'utf8');
const mf=new Miniflare({workers:[
 {name:'probe',modules:true,script,compatibilityDate:'2026-07-30',compatibilityFlags:['nodejs_compat'],bindings:{DELETION_PROJECT_REF:'kfnputowvfxozdiuhpzo'}},
 {name:'caller',modules:true,compatibilityDate:'2026-07-30',serviceBindings:{PROBE:{name:'probe',entrypoint:'DeletionDatabaseProbe'}},script:`export default {async fetch(r,env){return Response.json(await env.PROBE.verify())}}`}
],outboundService:()=>{throw Error('Unexpected network')}});
try{const probe=await mf.getWorker('probe');for(const method of ['GET','POST','DELETE'])assert.equal((await probe.fetch('https://fixture/verify',{method})).status,404);const caller=await mf.getWorker('caller');assert.deepEqual(await (await caller.fetch('https://fixture/')).json(),{passed:false,scope:'deletion_database_read_only',productionDeletionWritten:false});console.log('PASS bundled database probe: no public endpoint; missing secret fails closed without provider details. Local only.')}finally{await mf.dispose()}
