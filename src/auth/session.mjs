// The SDK owns token persistence and PKCE verification. This module never parses JWTs.
export function authConfiguration(value,currentOrigin){
 if(value?.enabled!==true)throw Error('auth_not_configured');
 const app=new URL(value.appOrigin),provider=new URL(value.url);
 for(const u of [app,provider])if(u.protocol!=='https:'||u.pathname!=='/'||u.search||u.hash||u.username||u.password)throw Error('invalid_origin');
 if(app.origin!==currentOrigin||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(value.publishableKey||''))throw Error('invalid_configuration');
 return {appOrigin:app.origin,url:provider.origin,publishableKey:value.publishableKey,...(value.deletionEnabled===true?{deletionEnabled:true}:{})};
}
export async function completeCallback({auth,href,origin,replace}){
 const url=new URL(href);if(url.origin!==origin)throw Error('invalid_callback');
 const callback=['/auth/callback','/auth/recovery'].includes(url.pathname);
 if(!callback){if(url.search||url.hash)replace('/auth/');return {callback:false}}
 // Remove codes/errors/fragments before any asynchronous work or SDK invocation.
 replace('/auth/');
 const codes=url.searchParams.getAll('code');
 if(url.hash||url.searchParams.has('error')||url.searchParams.has('error_code')||codes.length!==1||!codes[0]||codes[0].length>2048)throw Error('invalid_callback');
 const flows=url.searchParams.getAll('sb_flow_id');
 if(flows.length>1||(flows.length===1&&!/^[a-f0-9]{32}$/i.test(flows[0])))throw Error('invalid_callback');
 const {data,error}=await auth.exchangeCodeForSession(codes[0],flows.length?{flowId:flows[0]}:undefined);
 if(error||!data?.session)throw Error('invalid_callback');
 // Do not infer recovery authority from a pathname; SDK recovery events own the UI state.
 return {callback:true};
}
export function createAccountBridge({auth,origin,fetcher=fetch,onClear=()=>{}}){
 const base=new URL(origin);if(base.protocol!=='https:'||base.origin!==origin)throw Error('invalid_origin');
 let generation=0,owner=null,disposed=false;const pending=new Set();
 function clear(reason){generation++;for(const controller of pending)controller.abort();pending.clear();onClear(reason)}
 const subscription=auth.onAuthStateChange((event,session)=>{
  const next=session?.user?.id||null;
  if(event==='SIGNED_OUT'||event==='PASSWORD_RECOVERY'||(owner&&owner!==next))clear();
  owner=next;
 });
 async function request(path,{method='GET',body,key}={}){
  const target=new URL(path,base);
  const match=target.pathname.match(/^\/api\/(customers|quotes)(?:\/([0-9a-f-]{36}))?(\/followups)?$/i);
  if(target.origin!==origin||target.username||target.password||target.hash||!(['/api/onboarding','/api/account','/api/account/deletion','/api/account/deletion/status','/api/dashboard','/api/quote-drafts'].includes(target.pathname)||match)||!['GET','POST','PATCH','DELETE'].includes(method))throw Error('invalid_api_path');
  if([...target.searchParams.keys()].some(k=>!['limit','cursor'].includes(k)))throw Error('invalid_api_path');
  if(disposed)throw Error('session_changed');
  const stamp=generation;let timer,abort;
  try{
   const {data:sessionData,error}=await auth.getSession();const session=sessionData?.session;
   if(disposed||stamp!==generation)throw Error('session_changed');
   if(error||!session?.access_token||!session.user?.id||!session.user.email_confirmed_at||session.user.is_anonymous)throw Error('unauthorized');
   if(owner&&owner!==session.user.id)throw Error('session_changed');owner=session.user.id;
   abort=new AbortController();pending.add(abort);timer=setTimeout(()=>abort.abort(),10000);
   const response=await fetcher(target,{method,headers:{Authorization:'Bearer '+session.access_token,...(body===undefined?{}:{'Content-Type':'application/json'}),...(key?{'Idempotency-Key':key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),credentials:'omit',cache:'no-store',redirect:'error',signal:abort.signal});
   const reader=response.body?.getReader();let text='',bytes=0;const decoder=new TextDecoder();
   if(reader){try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>5*1024*1024){await reader.cancel();throw Error('response_too_large')}text+=decoder.decode(value,{stream:true})}text+=decoder.decode()}finally{reader.releaseLock()}}
   if(disposed||stamp!==generation||owner!==session.user.id)throw Error('session_changed');
   const data=text?JSON.parse(text):null;
   if(!response.ok){const known=['account_blocked','confirmation_required','plan_limit','customer_has_quotes','quote_closed','invalid_date','idempotency_conflict','rate_limited','not_found','account_unavailable'];const code=response.status===401?'unauthorized':known.includes(data?.error?.code)?data.error.code:'request_failed';if(response.status===401||response.status===403)clear(code);throw Error(code)}
   if((target.pathname==='/api/account'||(target.pathname==='/api/onboarding'&&method==='POST'))&&(data?.id!==owner||!['free','paid'].includes(data.plan)))throw Error('account_unavailable');
   if(data?.account_id&&data.account_id!==owner)throw Error('account_unavailable');
   if(Array.isArray(data?.items)&&data.items.some(row=>row.account_id!==owner))throw Error('account_unavailable');
   return data;
  }finally{clearTimeout(timer);if(abort)pending.delete(abort)}
 }
 return {clear,request,load:()=>request('/api/account'),dispose(){disposed=true;clear();subscription.data.subscription.unsubscribe()}};
}
