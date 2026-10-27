import {Miniflare} from 'miniflare';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
const built=await build({entryPoints:[new URL('../../src/server/deletion-archive-worker.mjs',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'neutral',external:['cloudflare:workers']});
const mf=new Miniflare({workers:[
 {name:'archive',modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-07-30',bindings:{ARCHIVE_SOURCE:'fixture'},r2Buckets:['DELETION_ARCHIVE']},
 {name:'trusted-test-caller',modules:true,compatibilityDate:'2026-07-30',serviceBindings:{ARCHIVE:{name:'archive',entrypoint:'DeletionArchive'}},script:`export default {async fetch(request,env){try{return Response.json(await env.ARCHIVE.retain(await request.text()));}catch{return new Response('denied',{status:400});}}}`}
],outboundService:()=>{throw Error('Unexpected network');}});
try {
 const archive=await mf.getWorker('archive'), caller=await mf.getWorker('trusted-test-caller');
 const bucket=await mf.getR2Bucket('DELETION_ARCHIVE','archive');
 const subject='11111111-1111-4111-8111-111111111111';
 for(const method of ['GET','POST','DELETE'])assert.equal((await archive.fetch('https://fixture/retain',{method})).status,404);
 assert.equal((await bucket.list()).objects.length,0);
 assert.equal((await caller.fetch('https://fixture/',{method:'POST',body:'invalid'})).status,400);
 assert.equal((await bucket.list()).objects.length,0);
 for(let i=0;i<2;i++)assert.deepEqual(await (await caller.fetch('https://fixture/',{method:'POST',body:subject})).json(),{retained:true});
 assert.equal((await bucket.list()).objects.length,1);
 console.log('PASS private archive: HTTP refuses all tested methods; invalid RPC writes nothing; trusted RPC retains and retries one marker. Local only.');
}finally{await mf.dispose();}
