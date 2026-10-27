const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function deletionHttp({origin,authenticate,admission,limiter}){
 const reply=(status,code)=>Response.json(status===202?{accepted:true}:{error:{code}},{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(status===429?{'Retry-After':'60'}:{})}});
 async function bounded(fn,ms=10000){let t;try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{t=setTimeout(()=>reject(Error('timeout')),ms)})]);}finally{clearTimeout(t)}}
 return async request=>{try{
  const u=new URL(request.url);
  const statusOnly=u.pathname==='/api/account/deletion/status';
  if((u.pathname!=='/api/account/deletion'&&!statusOnly)||u.search)return reply(404,'not_found');
  if(request.method!=='POST')return reply(405,'method_not_allowed');
  if(u.origin!==origin||request.headers.get('Origin')!==origin)return reply(403,'origin_rejected');
  if(!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('Content-Type')||''))return reply(415,'json_required');
  const match=(request.headers.get('Authorization')||'').match(/^Bearer ([^\s]{1,8192})$/);if(!match)return reply(401,'unauthorized');
  const user=await bounded(()=>authenticate(request));if(!uuid.test(user?.id||''))return reply(401,'unauthorized');
  if((await bounded(()=>limiter.limit({key:'deletion:'+user.id})))?.success!==true)return reply(429,'rate_limited');
  const reader=request.body?.getReader();if(!reader)return reply(400,'invalid_request');let bytes=0,text='';const deadline=Date.now()+10000;const decoder=new TextDecoder();
  try{while(true){const left=deadline-Date.now();if(left<=0)throw Error('timeout');const {done,value}=await bounded(()=>reader.read(),left);if(done)break;bytes+=value.byteLength;if(bytes>1024){void reader.cancel().catch(()=>{});return reply(413,'request_too_large')}text+=decoder.decode(value,{stream:true})}text+=decoder.decode();}finally{reader.releaseLock()}
  let body;try{body=JSON.parse(text)}catch{return reply(400,'invalid_request')}
  if(statusOnly){
   if(!body||Array.isArray(body)||Object.keys(body).length)return reply(400,'invalid_request');
   const result=await bounded(()=>admission.status({accessToken:match[1]}));
   if(!['none','pending','complete'].includes(result?.state))return reply(503,'deletion_pending');
   return Response.json({state:result.state},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(!body||Array.isArray(body)||Object.keys(body).length!==1||body.confirmation!=='DELETE MY ACCOUNT')return reply(400,'confirmation_required');
  const result=await bounded(()=>admission.confirm({accessToken:match[1],body}));
  if(result?.accepted!==true||!uuid.test(result.jobId||''))return reply(503,'deletion_pending');
  return reply(202);
 }catch{return reply(503,'deletion_pending')}};
}
