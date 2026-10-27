import {Miniflare} from 'miniflare';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const built=await build({entryPoints:[new URL('../../src/server/deletion-archive-worker.mjs',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'neutral',external:['cloudflare:workers']});
const mf=new Miniflare({workers:[
 {name:'archive',modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-07-30',bindings:{ARCHIVE_SOURCE:'production-fixture'},r2Buckets:['DELETION_ARCHIVE']},
 {name:'probe',modules:true,script:await readFile(new URL('./archive-probe.mjs',import.meta.url),'utf8'),compatibilityDate:'2026-07-30',serviceBindings:{ARCHIVE:{name:'archive',entrypoint:'DeletionArchive'}}}
],outboundService:()=>{throw Error('Unexpected network');}});
try {
 const caller=await mf.getWorker('probe'),bucket=await mf.getR2Bucket('DELETION_ARCHIVE','archive');
 for(const [url,options] of [ ['http://127.0.0.1/probe',{}],['http://127.0.0.1/probe',{method:'POST'}],['http://127.0.0.1/probe',{method:'POST',headers:{Origin:'https://evil.test','X-FollowKit-Probe':'1'}}],['http://evil.test/probe',{method:'POST',headers:{'X-FollowKit-Probe':'1'}}]])assert.ok([403,404].includes((await caller.fetch(url,options)).status));
 assert.equal((await bucket.list()).objects.length,0);
 for(let i=0;i<2;i++)assert.equal((await (await caller.fetch('http://127.0.0.1/probe',{method:'POST',headers:{'X-FollowKit-Probe':'1'}})).json()).passed,true);
 const objects=(await bucket.list()).objects;assert.equal(objects.length,1);assert.ok(objects[0].key.startsWith('tombstones/v1/diagnostic-v1/'));
 assert.equal((await bucket.list({prefix:'tombstones/v1/production-fixture/'})).objects.length,0);
 await bucket.put(objects[0].key,'conflict');
 assert.equal((await caller.fetch('http://127.0.0.1/probe',{method:'POST',headers:{'X-FollowKit-Probe':'1'}})).status,503);
 console.log('PASS local probe: request guards, RPC readback/retry, diagnostic-only namespace, conflict fails closed. No remote calls.');
}finally{await mf.dispose();}
