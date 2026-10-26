import {Fault} from './errors.mjs';
// Provider user lookup is not evidence of immediate session revocation.
export function supabaseAuthenticator({url,publishableKey,fetcher=fetch,timeoutMs=5000}){
 const base=new URL(url);if(base.protocol!=='https:'||base.pathname!=='/'||base.username||base.password||base.search||base.hash||!publishableKey)throw Error('HTTPS auth origin and key required');
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('Invalid auth timeout');
 return async request=>{
  const authorization=request.headers.get('authorization')||'';if(!/^Bearer [^\s]{1,8192}$/.test(authorization))return null;
  const controller=new AbortController();let timer;
  const work=(async()=>{
   const response=await fetcher(new URL('/auth/v1/user',base),{headers:{authorization,apikey:publishableKey},redirect:'manual',signal:controller.signal});
   if(response.status===401||response.status===403){void response.body?.cancel().catch(()=>{});return null}
   if(!response.ok){void response.body?.cancel().catch(()=>{});throw new Fault(503,'auth_unavailable')}
   const reader=response.body?.getReader();if(!reader)throw new Fault(503,'auth_unavailable');let size=0,chunks=[];
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){void reader.cancel().catch(()=>{});throw new Fault(503,'auth_unavailable')}chunks.push(value)}}finally{reader.releaseLock()}
   const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length}let user;try{user=JSON.parse(new TextDecoder().decode(bytes))}catch{throw new Fault(503,'auth_unavailable')}
   if(typeof user?.id!=='string'||!user.id||typeof user.email_confirmed_at!=='string'||!user.email_confirmed_at||user.is_anonymous===true)return null;
   return {id:user.id};
  })();
  try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Fault(503,'auth_unavailable'))},timeoutMs)})])}catch{throw new Fault(503,'auth_unavailable')}finally{clearTimeout(timer)}
 };
}
