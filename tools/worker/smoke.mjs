import {Miniflare} from 'miniflare';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const owner='11111111-1111-4111-8111-111111111111';
let outboundCalls=0;let redirectAt=null;
const outboundService=async request=>{
 const url=new URL(request.url);outboundCalls++;
 if(url.pathname===redirectAt)return new Response('{}',{status:302,headers:{Location:'https://forbidden.test/stolen'}});
 assert.equal(url.origin,'https://db.test');assert.equal(request.headers.get('authorization'),'Bearer fixture');
 if(url.pathname==='/auth/v1/user')return Response.json({id:owner,email_confirmed_at:'2026-10-25'});
 if(url.pathname==='/rest/v1/rpc/fk_onboarding_status')return Response.json({status:'setup_required'});
 if(url.pathname==='/rest/v1/rpc/fk_provision_account'){assert.deepEqual(await request.json(),{p_confirm:true});return Response.json({id:owner,plan:'free'})}
 if(url.pathname==='/rest/v1/fk_accounts'){assert.equal(url.searchParams.get('id'),'eq.'+owner);return Response.json([{id:owner,plan:'free',state:'active'}])}
 throw Error('Unexpected outbound request');
};
const options={rootPath:fileURLToPath(new URL('../../',import.meta.url)),modulesRoot:fileURLToPath(new URL('../../',import.meta.url)),modules:true,scriptPath:fileURLToPath(new URL('../../worker-dist/worker.mjs',import.meta.url)),compatibilityDate:'2026-07-30',assets:{directory:fileURLToPath(new URL('../../auth-dist',import.meta.url)),binding:'ASSETS',routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:true},assetConfig:{html_handling:'none'}},outboundService,bindings:{FOLLOWKIT_API_ENABLED:'true',APP_ORIGIN:'https://app.test',SUPABASE_URL:'https://db.test',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'}};
let mf;let passed=0;
try{
 mf=new Miniflare(options);
 for(const path of ['/__test/session','/offline.html','/src/server/store.mjs'])assert.equal((await mf.dispatchFetch('https://app.test'+path)).status,404);console.log('PASS workerd excludes test and static routes');passed++;
 assert.equal((await mf.dispatchFetch('https://app.test/api/account')).status,401);console.log('PASS workerd rejects missing bearer');passed++;
 assert.equal((await mf.dispatchFetch('https://app.test/api/account',{headers:{cookie:'fk_test=synthetic','oai-authenticated-user-id':owner}})).status,401);console.log('PASS workerd ignores test cookies and spoofed identity headers');passed++;
 assert.equal((await mf.dispatchFetch('https://app.test/api/account',{headers:{origin:'https://evil.test'}})).status,403);console.log('PASS workerd rejects foreign origin');passed++;
 const valid=await mf.dispatchFetch('https://app.test/api/account',{headers:{authorization:'Bearer fixture'}});if(valid.status!==200)console.log('diagnostic',await valid.clone().text(),{outboundCalls});assert.equal(valid.status,200);assert.deepEqual(await valid.json(),{id:owner,plan:'free'});assert.equal(valid.headers.get('cache-control'),'no-store');console.log('PASS workerd authenticates and reads account using mocked outbound services');passed++;
 for(const path of ['/auth/v1/user','/rest/v1/fk_accounts']){redirectAt=path;const before=outboundCalls;const r=await mf.dispatchFetch('https://app.test/api/account',{headers:{authorization:'Bearer fixture'}});assert.equal(r.status,503);assert.equal(outboundCalls-before,path==='/auth/v1/user'?1:2)}redirectAt=null;console.log('PASS workerd rejects auth and data redirects without following Location');passed++;
 for(const path of ['/auth/','/auth/callback?code=fixture','/auth/recovery?code=fixture']){const r=await mf.dispatchFetch('https://app.test'+path);assert.equal(r.status,200);assert.match(await r.text(),/id="auth-form"/);assert.match(r.headers.get('content-security-policy'),/connect-src/)}assert.equal((await mf.dispatchFetch('https://app.test/auth/index.html')).status,404);assert.equal((await mf.dispatchFetch('https://app.test/auth/boot.mjs')).status,200);console.log('PASS workerd routes auth assets and callbacks through guarded allowlist');passed++;
 const setup=await mf.dispatchFetch('https://app.test/api/onboarding',{headers:{authorization:'Bearer fixture'}});assert.deepEqual(await setup.json(),{status:'setup_required'});const provision=await mf.dispatchFetch('https://app.test/api/onboarding',{method:'POST',headers:{authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({confirm:true})});assert.equal(provision.status,200);assert.deepEqual(await provision.json(),{id:owner,plan:'free'});console.log('PASS workerd routes explicit onboarding before account lookup');passed++;
 await mf.setOptions({...options,bindings:{FOLLOWKIT_API_ENABLED:'false'}});
 assert.equal((await mf.dispatchFetch('https://app.test/api/account')).status,503);console.log('PASS workerd fails closed with disabled configuration');passed++;
 console.log(`RESULT ${passed}/9 workerd smoke groups passed. All outbound calls handled by a local stub; provider responses mocked. No deployment.`);
}catch(e){console.error('FAIL workerd smoke: '+e.message);process.exitCode=1}finally{await mf?.dispose();}
