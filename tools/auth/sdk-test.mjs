import {createClient} from '@supabase/supabase-js';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {completeCallback,createAccountBridge,authConfiguration} from '../../src/auth/session.mjs';import {createAuthController} from '../../src/auth/controller.mjs';import {createWorker} from '../../src/worker/index.mjs';
const owner='11111111-1111-4111-8111-111111111111',user={id:owner,email:'fixture@example.test',email_confirmed_at:'2026-10-25',aud:'authenticated'};
const token=n=>Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:owner,exp:Math.floor(Date.now()/1000)+3600,fixture:n})).toString('base64url')+'.fixture';
const session=n=>({access_token:token(n),refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,user});
let challenge='',flow='',used=false,authCalls=0,accountCalls=0;
const storageData=new Map(),storage={getItem:k=>storageData.get(k)||null,setItem:(k,v)=>storageData.set(k,v),removeItem:k=>storageData.delete(k)};
const fetcher=async(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url||String(input));assert.equal(url.origin,'https://db.test');const body=init.body?JSON.parse(init.body):{};
 if(url.pathname==='/auth/v1/recover'){challenge=body.code_challenge;flow=new URL(url.searchParams.get('redirect_to')).searchParams.get('sb_flow_id');assert.equal(body.code_challenge_method,'s256');return Response.json({})}
 if(url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='pkce'){
  if(used||body.auth_code!=='fixture-code'||createHash('sha256').update(body.code_verifier||'').digest('base64url')!==challenge)return Response.json({error:'invalid_grant',error_description:'fixture expired or wrong verifier'},{status:400});
  used=true;return Response.json(session(1));
 }
 if(url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='password')return Response.json(session(1));
 if(url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='refresh_token')return Response.json(session(2));
 if(url.pathname==='/auth/v1/user'){authCalls++;return Response.json(user)}
 if(url.pathname==='/auth/v1/logout')return new Response(null,{status:204});
 if(url.pathname==='/rest/v1/fk_accounts'){accountCalls++;assert.equal(url.searchParams.get('id'),'eq.'+owner);return Response.json([{id:owner,plan:'free',state:'active'}])}
 throw Error('Unexpected fixture endpoint');
};
const client=createClient('https://db.test','sb_publishable_fixture',{global:{fetch:fetcher},auth:{flowType:'pkce',detectSessionInUrl:false,persistSession:true,autoRefreshToken:false,storage,storageKey:'sdk-fixture'}});
const controller=createAuthController({auth:client.auth,origin:'https://app.test'});
const worker=createWorker({fetcher});const env={FOLLOWKIT_API_ENABLED:'true',APP_ORIGIN:'https://app.test',SUPABASE_URL:'https://db.test',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
let sent='';const bridge=createAccountBridge({auth:client.auth,origin:'https://app.test',fetcher:async(url,init)=>{sent=init.headers.Authorization;assert.equal(init.credentials,'omit');return worker.fetch(new Request(url,init),env)}});
try{
 await client.auth.getSession();
 assert.equal(authConfiguration({enabled:true,appOrigin:'https://app.test',url:'https://db.test',publishableKey:'sb_publishable_fixture'},'https://app.test').appOrigin,'https://app.test');
 assert.throws(()=>authConfiguration({enabled:true,appOrigin:'https://evil.test',url:'https://db.test',publishableKey:'sb_secret_bad'},'https://app.test'));console.log('PASS SDK configuration rejects wrong origin and secret keys');
 await controller.run('reset',{email:user.email});assert.ok(challenge);let cleaned='';
 await completeCallback({auth:client.auth,href:'https://app.test/auth/recovery?code=fixture-code'+(flow?'&sb_flow_id='+flow:'')+'&next=https://evil.test',origin:'https://app.test',replace:path=>{cleaned=path}});
 assert.equal(cleaned,'/auth/');assert.equal(controller.getState().view,'recovery');console.log('PASS real SDK PKCE challenge/verifier exchange emits recovery and cleans URL');
 await assert.rejects(completeCallback({auth:client.auth,href:'https://app.test/auth/callback?code=fixture-code',origin:'https://app.test',replace:()=>{}}));console.log('PASS replayed callback rejected after verifier consumption');
 let exchanged=0;for(const suffix of ['','?code=one&code=two','?error=denied&code=x','#access_token=bad'])await assert.rejects(completeCallback({auth:{exchangeCodeForSession:()=>{exchanged++}},href:'https://app.test/auth/callback'+suffix,origin:'https://app.test',replace:()=>{}}));assert.equal(exchanged,0);console.log('PASS malformed and implicit callbacks never reach exchange');
 assert.deepEqual(await bridge.load(),{id:owner,plan:'free'});assert.equal(authCalls,1);assert.equal(accountCalls,1);assert.equal(sent,'Bearer '+token(1));console.log('PASS real SDK session bearer reaches Worker auth and owner-scoped repository');
 await client.auth.refreshSession();await bridge.load();assert.equal(sent,'Bearer '+token(2));console.log('PASS refreshed SDK token replaces prior token on next Worker request');
 await client.auth.signOut({scope:'global'});await assert.rejects(bridge.load());assert.equal(controller.getState().view,'login');console.log('PASS SDK logout clears persisted session and prevents account fetch');
 const wrong=createClient('https://db.test','sb_publishable_fixture',{global:{fetch:fetcher},auth:{flowType:'pkce',detectSessionInUrl:false,persistSession:false,autoRefreshToken:false}});
 const missing=await wrong.auth.exchangeCodeForSession('fixture-code');assert.ok(missing.error);await wrong.auth.stopAutoRefresh();console.log('PASS code exchange without stored verifier fails');
 console.log('RESULT 8/8 SDK integration groups passed. Actual SDK + Worker code, all provider/data responses mocked; no live emails or deployment.');
}finally{bridge.dispose();controller.dispose();await client.auth.stopAutoRefresh()}
