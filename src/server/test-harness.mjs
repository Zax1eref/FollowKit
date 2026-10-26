// Explicit synthetic-account harness. NEVER deploy or use for real customer data.
import {randomBytes} from 'node:crypto';
import {createApi,readBody} from './api.mjs';
import {Fault} from './errors.mjs';
import {createRateLimiter} from './rate-limit.mjs';
export function createTestHarness({store,html,enabled=false,clock=()=>Date.now()}){
 if(!enabled||process.env.NODE_ENV==='production')throw Error('Synthetic-account harness requires explicit test mode and cannot run in production');
 const csrf=randomBytes(24).toString('hex');const sessions=new Map();const deletionLimit=createRateLimiter({writeLimit:5});
 const reply=(status,data,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
 const session=req=>{const token=req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('fk_test='))?.slice(8);const s=sessions.get(token);if(s&&s.expires<=clock()){sessions.delete(token);return null}return s?{...s,token}:null};
 const api=createApi({store,authenticate:async req=>{const s=session(req);return s?{id:s.id,token:s.token}:null},isIdentityActive:identity=>{const s=sessions.get(identity.token);return s?.id===identity.id&&s.expires>clock()}});
 return async req=>{const url=new URL(req.url);if(!['127.0.0.1','localhost','terminal.local','local.test'].includes(url.hostname))return reply(403,{error:{code:'test_host_only'}});
 if(!['GET','HEAD'].includes(req.method)&& (req.headers.get('origin')!==url.origin||req.headers.get('x-followkit-csrf')!==csrf))return reply(403,{error:{code:'csrf_rejected'}});
 if(url.pathname==='/__test/info'&&req.method==='GET'){const s=session(req);return reply(200,{mode:'synthetic-accounts-only',csrf,account:s?.id??null})}
 if(url.pathname==='/__test/session'&&req.method==='POST'){let body;try{body=await req.json()}catch{return reply(400,{error:{code:'invalid_json'}})}if(!['A','B'].includes(body?.account))return reply(400,{error:{code:'invalid_fixture'}});const old=session(req);if(old)sessions.delete(old.token);for(const [key,value] of sessions)if(value.expires<=clock())sessions.delete(key);if(sessions.size>=100)return reply(429,{error:{code:'test_session_limit'}});const token=randomBytes(32).toString('hex');sessions.set(token,{id:'test-'+body.account,expires:clock()+3600000});return reply(200,{account:'test-'+body.account},{'Set-Cookie':`fk_test=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`})}
 if(url.pathname==='/__test/session'&&req.method==='DELETE'){const s=session(req);if(s)sessions.delete(s.token);return reply(200,{account:null},{'Set-Cookie':'fk_test=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'})}
 if(url.pathname==='/__test/account'&&req.method==='DELETE'){
  const current=session(req);if(!current)return reply(401,{error:{code:'unauthorized'}});
  const rate=deletionLimit(current.id,'DELETE');if(!rate.allowed)return reply(429,{error:{code:'rate_limited'}},{'Retry-After':String(rate.retryAfter)});
  try{
   const body=await readBody(req);
   if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).length!==1||body.confirmation!=='DELETE '+current.id)return reply(400,{error:{code:'confirmation_required'}});
   // Revalidate after asynchronous body parsing: another request may revoke this session.
   if(session(req)?.token!==current.token)return reply(401,{error:{code:'unauthorized'}});
   store.deleteAccount(current.id);
   for(const [token,value] of sessions)if(value.id===current.id)sessions.delete(token);
   return reply(200,{deleted:true},{'Set-Cookie':'fk_test=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
  }catch(e){return reply(e instanceof Fault?e.status:500,{error:{code:e instanceof Fault?e.code:'internal_error'}})}
 }
 if(url.pathname.startsWith('/api/'))return api(req);
 if(req.method==='GET'&&['/','/index.html','/offline.html'].includes(url.pathname))return new Response((url.pathname==='/offline.html'?html:html.replace('/* APPLICATION MODE */','window.FOLLOWKIT_TEST_MODE=true;')),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'"}});
 return reply(404,{error:{code:'not_found'}});
 };
}
