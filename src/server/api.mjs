import {createRateLimiter} from './rate-limit.mjs';
import {Fault} from './errors.mjs';
import {bangkokDay} from '../domain.mjs';
function reply(status,data,extraHeaders={}){return new Response(status===204?null:JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extraHeaders}})}
export async function readBody(request){if(!(request.headers.get('content-type')||'').startsWith('application/json'))throw new Fault(415,'json_required');const reader=request.body?.getReader();if(!reader)throw new Fault(400,'invalid_json');let size=0,chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();throw new Fault(413,'body_too_large')}chunks.push(value)}}finally{reader.releaseLock()}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}try{return JSON.parse(new TextDecoder().decode(bytes))}catch{throw new Fault(400,'invalid_json')}}
// Identity must come from an injected, trusted server authenticator, never request body/header account IDs.
// No network listener or test identity shortcut is shipped by default.
export function createApi({store,repositoryFor,authenticate=async()=>null,isIdentityActive=()=>true,clock=()=>new Date(),limiter=createRateLimiter()}){
 return async function handle(request){try{
  const identity=await authenticate(request);
  const active=async()=>{if(!identity?.id||!await isIdentityActive(identity))throw new Fault(401,'unauthorized')};
  await active();const owner=identity.id;
  const rate=limiter(owner,request.method);if(!rate.allowed)return reply(429,{error:{code:'rate_limited'}},{'Retry-After':String(rate.retryAfter)});
  const repository=repositoryFor?await repositoryFor({identity,request}):store;
  const run=async(method,...args)=>{await active();if(typeof repository?.[method]!=='function')throw new Fault(503,'repository_unavailable');return await repository[method](owner,...args)};
  const u=new URL(request.url),path=u.pathname,method=request.method;
  if(path==='/api/onboarding'&&method==='GET')return reply(200,await run('onboardingStatus'));
  if(path==='/api/onboarding'&&method==='POST'){const body=await readBody(request);if(!body||body.confirm!==true||Object.keys(body).length!==1)throw new Fault(400,'confirmation_required');return reply(200,await run('provisionAccount'));}
  const account=await run('account');
  if(method==='GET'&&path==='/api/account/export')return reply(200,await run('exportAccount',clock()),{'Content-Disposition':'attachment; filename="followkit-account-export.json"'});
  if(method==='GET'&&path==='/api/account')return reply(200,account);
  if(method==='GET'&&path==='/api/dashboard')return reply(200,await run('dashboard',bangkokDay(clock())));
  if(path==='/api/billing/checkout'&&method==='POST')return reply(503,{error:{code:'payment_not_configured'}});
  if(path==='/api/quote-drafts'&&method==='POST')return reply(201,await run('createQuote',await readBody(request),request.headers.get('idempotency-key'),'quote-draft'));
  const match=path.match(/^\/api\/(customers|quotes)(?:\/([^/]+))?(?:\/(followups))?$/);if(!match)throw new Fault(404,'not_found');const [,table,id,events]=match;
  if(events){if(table!=='quotes'||!id)throw new Fault(404,'not_found');if(method==='GET')return reply(200,{items:await run('followups',id)});if(method==='POST')return reply(201,await run('followup',id,await readBody(request),clock()));throw new Fault(405,'method_not_allowed')}
  if(method==='GET')return reply(200,id?await run('get',table,id):await run('page',table,{limit:u.searchParams.has('limit')?Number(u.searchParams.get('limit')):100,cursor:u.searchParams.get('cursor')}));
  if(method==='POST'&&!id){const body=await readBody(request);return reply(201,table==='customers'?await run('customer',body):await run('createQuote',body,request.headers.get('idempotency-key'),'quote'));}
  if(method==='PATCH'&&id)return reply(200,await run(table==='customers'?'customer':'quote',await readBody(request),id));
  if(method==='DELETE'&&id){await run(table==='customers'?'deleteCustomer':'deleteQuote',id);return reply(204)}
  throw new Fault(405,'method_not_allowed');
 }catch(e){return reply(e instanceof Fault?e.status:500,{error:{code:e instanceof Fault?e.code:'internal_error'}})}}
}
