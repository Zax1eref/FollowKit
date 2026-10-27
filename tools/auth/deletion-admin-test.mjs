import {createClient} from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import {deletionAuth} from '../../src/server/deletion-auth.mjs';
const owner='22222222-2222-4222-8222-222222222222',jobId='11111111-1111-4111-8111-111111111111';
let present=true;const calls=[];
const client=createClient('https://fixture.supabase.co','fixture-server-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,options)=>{
 assert.equal(String(url),'https://fixture.supabase.co/auth/v1/admin/users/'+owner);
 const method=options.method;calls.push(method);
 if(method==='DELETE'){assert.deepEqual(JSON.parse(options.body),{should_soft_delete:false});present=false;return Response.json({id:owner});}
 assert.equal(method,'GET');
 return present?Response.json({id:owner}):Response.json({code:'user_not_found',msg:'User not found'},{status:404,headers:{'x-supabase-api-version':'2024-01-01'}});
}}});
const adapter=deletionAuth({admin:client.auth.admin,readiness:async()=>true});
assert.deepEqual(await adapter.removeIdentity({owner,jobId}),{done:true});
assert.deepEqual(await adapter.removeIdentity({owner,jobId}),{done:true});
assert.deepEqual(calls,['GET','DELETE','GET','GET']);
console.log('PASS pinned Supabase SDK admin request/response contract and idempotent readback; mocked transport only.');
