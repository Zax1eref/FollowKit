// Standalone API Worker. Deliberately no static demo, synthetic session or SQLite imports.
import {createApi} from '../server/api.mjs';
import {supabaseAuthenticator} from '../server/auth.mjs';
import {httpRepositoryFactory} from '../server/http-repository.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const failure=(status,code,headers={})=>new Response(JSON.stringify({error:{code}}),{status,headers:{'Content-Type':'application/json; charset=utf-8',...headers}});
function secure(response){const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");headers.delete('Access-Control-Allow-Origin');return new Response(response.body,{status:response.status,headers})}
function origin(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('invalid origin');return u.origin}
function configuration(env){if(env.FOLLOWKIT_API_ENABLED!=='true')throw Error('disabled');const appOrigin=origin(env.APP_ORIGIN),url=origin(env.SUPABASE_URL),publishableKey=env.SUPABASE_PUBLISHABLE_KEY;if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey||''))throw Error('invalid key');return {appOrigin,url,publishableKey}}
function methods(path){
 if(path==='/api/onboarding')return ['GET','POST'];
 if(['/api/account','/api/account/export','/api/dashboard'].includes(path))return ['GET'];
 if(['/api/quote-drafts','/api/billing/checkout'].includes(path))return ['POST'];
 if(['/api/customers','/api/quotes'].includes(path))return ['GET','POST'];
 const match=path.match(/^\/api\/(customers|quotes)\/([^/]+)(\/followups)?$/);
 if(!match||!uuid.test(match[2])||(match[3]&&match[1]!=='quotes'))return null;
 return match[3]?['GET','POST']:['GET','PATCH','DELETE'];
}
export function createWorker({fetcher=(input,init)=>fetch(input,init),authTimeoutMs=5000}={}){
 let cachedConfig='',api;
 return {async fetch(request,env={}){try{
  const u=new URL(request.url);
  const authPaths=['/auth/','/auth/callback','/auth/recovery','/auth/boot.mjs','/auth/style.css','/auth/thai.woff2','/auth/config'];
  if(authPaths.includes(u.pathname)){
   if(request.method!=='GET')return secure(failure(405,'method_not_allowed',{Allow:'GET'}));
   let config;try{config=configuration(env)}catch{return secure(failure(503,'service_not_configured'))}
   if(u.origin!==config.appOrigin||(request.headers.has('origin')&&request.headers.get('origin')!==config.appOrigin))return secure(failure(403,'origin_rejected'));
   if(u.pathname==='/auth/config')return secure(new Response(JSON.stringify({enabled:true,...config}),{headers:{'Content-Type':'application/json'}}));
   if(!env.ASSETS)return secure(failure(503,'assets_unavailable'));
   const file=['/auth/','/auth/callback','/auth/recovery'].includes(u.pathname)?'/auth/index.html':u.pathname;
   const asset=await env.ASSETS.fetch(new Request(new URL(file,config.appOrigin)));
   if(!asset.ok)return secure(failure(503,'assets_unavailable'));
   const response=secure(asset);
   response.headers.set('Content-Security-Policy',`default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self' ${config.url}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
   return response;
  }
  const allowed=methods(u.pathname);
  // Routes are an allowlist. /__test/*, offline/demo, account deletion and files have no handler.
  if(!allowed)return secure(failure(404,'not_found'));
  if(!allowed.includes(request.method))return secure(failure(405,'method_not_allowed',{Allow:allowed.join(', ')}));
  let config;try{config=configuration(env)}catch{return secure(failure(503,'service_not_configured'))}
  if(u.origin!==config.appOrigin)return secure(failure(403,'origin_rejected'));
  const suppliedOrigin=request.headers.get('origin');
  if(suppliedOrigin&&suppliedOrigin!==config.appOrigin)return secure(failure(403,'origin_rejected'));
  // Only explicit bearer credentials; cookies and identity headers are never authentication.
  const key=JSON.stringify(config);
  if(key!==cachedConfig){
   const provider=supabaseAuthenticator({...config,fetcher,timeoutMs:authTimeoutMs});
   api=createApi({authenticate:async req=>{const user=await provider(req);return user&&uuid.test(user.id)?user:null},repositoryFor:httpRepositoryFactory({...config,fetcher})});
   cachedConfig=key;
  }
  return secure(await api(request));
 }catch{return secure(failure(500,'internal_error'))}}};
}
export default createWorker();
