import {createClient} from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import {deletionSessions} from '../../src/server/deletion-sessions.mjs';
const owner='22222222-2222-4222-8222-222222222222',jobId='11111111-1111-4111-8111-111111111111';
let sessions=1;const calls=[];
const client=createClient('https://fixture.supabase.co','fixture-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,options)=>{
 calls.push([String(url),options.method]);
 if(options.method==='GET'){assert.equal(String(url),'https://fixture.supabase.co/auth/v1/user');return Response.json({id:owner});}
 assert.equal(String(url),'https://fixture.supabase.co/auth/v1/logout?scope=global');assert.equal(options.method,'POST');sessions=0;return new Response(null,{status:204});
}}});
const adapter=deletionSessions({auth:client.auth,accessToken:'fixture-token',inspect:async()=>({ready:true,activeSessions:sessions})});
assert.deepEqual(await adapter.revokeSessions({owner,jobId}),{done:true});assert.equal(calls.length,2);
console.log('PASS pinned SDK verifies identity then global logout; mock transport only.');
