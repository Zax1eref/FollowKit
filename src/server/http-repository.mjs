import {Fault} from './errors.mjs';
import {validDay} from '../domain.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad=(code='invalid_fields')=>{throw new Fault(400,code)};
const id=value=>{if(typeof value!=='string'||!uuid.test(value))bad('invalid_id');return value};
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))bad()}
function text(value,max){if(typeof value!=='string'||!value.trim()||value.trim().length>max)bad('invalid_text');return value.trim()}
function quoteFields(value,partial=false){const keys=['title','amount_satang','sent_on','due_on','status'];for(const key of keys){if(!(key in value)&&partial)continue;if(key==='status'&&value[key]===undefined&&!partial)continue;if(key==='title')text(value[key],160);else if(key==='amount_satang'){if(!Number.isSafeInteger(value[key])||value[key]<0||value[key]>10000000000)bad('invalid_amount')}else if(key==='status'){if(!['pending','won','lost'].includes(value[key]))bad('invalid_status')}else if(!validDay(value[key]))bad('invalid_date')}if(value.sent_on&&value.due_on&&value.due_on<value.sent_on)bad('invalid_date')}
const tableNames={customers:'fk_customers',quotes:'fk_quotes'};
const errorCodes={account_blocked:[403,'account_blocked'],confirmation_required:[400,'confirmation_required'],not_found:[404,'not_found'],unauthorized:[401,'unauthorized'],plan_limit:[409,'plan_limit'],customer_has_quotes:[409,'customer_has_quotes'],idempotency_conflict:[409,'idempotency_conflict'],quote_closed:[409,'quote_closed'],invalid_fields:[400,'invalid_fields'],choose_customer:[400,'choose_customer'],invalid_date:[400,'invalid_date'],idempotency_key_required:[400,'idempotency_key_required']};
const protocol=()=>{throw new Fault(502,'database_response_invalid')};
function row(data){if(Array.isArray(data)){if(data.length!==1)protocol();data=data[0]}if(!data||typeof data!=='object'||Array.isArray(data))protocol();return data}
const legacyFollowup=f=>({...f,note:JSON.stringify({note:f.note,next_due:f.next_due})});
export function createHttpRepository({url,publishableKey,owner,authorization,fetcher=fetch,timeoutMs=5000,maxResponseBytes=5*1024*1024}){
 const base=new URL(url);if(base.protocol!=='https:'||base.pathname!=='/'||base.username||base.password||base.search||base.hash||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey))throw Error('HTTPS origin and publishable key required');
 id(owner);if(!/^Bearer [^\s]{1,8192}$/.test(authorization||''))throw new Fault(401,'unauthorized');
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000||!Number.isInteger(maxResponseBytes)||maxResponseBytes<1)throw Error('Invalid transport bounds');
 const scoped=value=>{if(value!==owner)throw new Fault(403,'owner_mismatch')};
 // Immutable closure per request. No shared mutable client/token and no automatic write retry.
 async function request(path,body){const controller=new AbortController();let timer;const work=(async()=>{
  const response=await fetcher(new URL('/rest/v1/'+path,base),{method:body===undefined?'GET':'POST',headers:{apikey:publishableKey,Authorization:authorization,'Content-Type':'application/json',Prefer:'count=exact'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual',signal:controller.signal});
  if(response.status>=300&&response.status<400){void response.body?.cancel().catch(()=>{});throw new Fault(503,'database_unavailable')}
  const reader=response.body?.getReader();let size=0,chunks=[];
  if(reader){try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxResponseBytes){void reader.cancel().catch(()=>{});throw new Fault(502,'database_response_too_large')}chunks.push(value)}}finally{reader.releaseLock()}}
  let data=null;if(size){const all=new Uint8Array(size);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length}try{data=JSON.parse(new TextDecoder().decode(all))}catch{protocol()}}
  if(!response.ok){const known=errorCodes[data?.message];if(known)throw new Fault(...known);if(response.status===401)throw new Fault(401,'unauthorized');if(response.status===403)throw new Fault(403,'forbidden');if(response.status===429)throw new Fault(429,'rate_limited');if(['23514','23502','22P02','22007','22008'].includes(data?.code))bad('invalid_input');if(data?.code==='23503')throw new Fault(409,'invalid_reference');throw new Fault(503,'database_unavailable')}
  return {data,response};
 })();
 try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Fault(504,'database_timeout'))},timeoutMs)})])}catch(e){if(e instanceof Fault)throw e;throw new Fault(503,'database_unavailable')}finally{clearTimeout(timer)}
 }
 const rpc=async(name,args={})=>(await request('rpc/'+name,args)).data;
 const owned=r=>{r=row(r);if(r.account_id!==owner)protocol();return r};
 async function get(who,table,key){scoped(who);id(key);const target=tableNames[table];if(!target)bad();const data=(await request(target+'?'+new URLSearchParams({select:'*',account_id:'eq.'+owner,id:'eq.'+key,limit:'1'}))).data;if(!Array.isArray(data))protocol();if(!data.length)throw new Fault(404,'not_found');const result=owned(data);if(result.id!==key)protocol();return result}
 return {
  async onboardingStatus(who){scoped(who);const data=row(await rpc('fk_onboarding_status'));if(!['ready','setup_required','blocked'].includes(data.status))protocol();return {status:data.status}},
  async provisionAccount(who){scoped(who);const data=row(await rpc('fk_provision_account',{p_confirm:true}));if(data.id!==owner||!['free','paid'].includes(data.plan))protocol();return {id:data.id,plan:data.plan}},
  async account(who){scoped(who);const data=(await request('fk_accounts?'+new URLSearchParams({select:'id,plan,state',id:'eq.'+owner,limit:'1'}))).data;if(!Array.isArray(data))protocol();if(!data.length)throw new Fault(403,'account_unavailable');const a=row(data);if(a.id!==owner||a.state!=='active'||!['free','paid'].includes(a.plan))protocol();return {id:a.id,plan:a.plan}},
  get,
  async page(who,table,{limit=100,cursor=null}={}){scoped(who);const target=tableNames[table];if(!target||!Number.isInteger(limit)||limit<1||limit>200)bad('invalid_page_limit');let after;try{if(cursor){if(typeof cursor!=='string'||cursor.length>1024)throw Error();const c=JSON.parse(atob(cursor));if(c.owner!==owner||c.table!==table||!uuid.test(c.after))throw Error();after=c.after}}catch{bad('invalid_cursor')}
   const params=new URLSearchParams({select:'*',account_id:'eq.'+owner,order:'id.asc',limit:String(limit+1)});if(after)params.set('id','gt.'+after);const {data,response}=await request(target+'?'+params);if(!Array.isArray(data)||data.length>limit+1)protocol();const range=response.headers.get('content-range')?.match(/^(?:\d+-\d+|\*)\/(\d+)$/);if(!range)protocol();const total=Number(range[1]);if(!Number.isSafeInteger(total)||total<data.length||(!data.length&&total))protocol();for(const r of data){owned(r);if(!uuid.test(r.id))protocol()}const items=data.slice(0,limit);return {items,next_cursor:total>items.length?btoa(JSON.stringify({owner,table,after:items.at(-1).id})):null}},
  async customer(who,input,key){scoped(who);exact(input,['name','contact']);const name=text(input.name,100),contact=input.contact??'';if(typeof contact!=='string'||contact.length>250)bad('invalid_contact');return owned(await rpc('fk_save_customer',{p_name:name,p_contact:contact,p_id:key?id(key):null}))},
  async deleteCustomer(who,key){scoped(who);await rpc('fk_delete_customer',{p_id:id(key)})},
  async createQuote(who,input,key,scope='quote-draft'){scoped(who);exact(input,scope==='quote'?['customer_id','title','amount_satang','sent_on','due_on','status']:['customer_id','customer_name','title','amount_satang','sent_on','due_on','status']);if(!['quote','quote-draft'].includes(scope))bad();quoteFields(input);if(typeof key!=='string'||!/^[-a-zA-Z0-9_]{16,128}$/.test(key))bad('idempotency_key_required');if(Boolean(input.customer_id)===Boolean(input.customer_name))bad('choose_customer');const args={p_scope:scope,p_key:key,p_title:input.title,p_amount:input.amount_satang,p_sent:input.sent_on,p_due:input.due_on,p_status:input.status??'pending',p_customer_id:input.customer_id?id(input.customer_id):null,p_customer_name:input.customer_name?text(input.customer_name,100):null};return owned(await rpc('fk_create_quote_scoped',args))},
  async quote(who,input,key){scoped(who);id(key);exact(input,['customer_id','title','amount_satang','sent_on','due_on','status']);quoteFields(input,true);if('customer_id'in input)id(input.customer_id);return owned(await rpc('fk_patch_quote',{p_id:key,p_patch:input}))},
  async deleteQuote(who,key){scoped(who);await rpc('fk_delete_quote',{p_id:id(key)})},
  async followups(who,key){scoped(who);const data=await rpc('fk_followups_json',{p_id:id(key)});if(!Array.isArray(data))protocol();return data.map(f=>{owned(f);if(f.quote_id!==key)protocol();return legacyFollowup(f)})},
  async followup(who,key,input){scoped(who);exact(input,['note','next_due','idempotency_key']);const note=text(input.note,2000),requestKey=text(input.idempotency_key,100);if(!validDay(input.next_due))bad('invalid_date');const f=owned(await rpc('fk_followup',{p_quote_id:id(key),p_key:requestKey,p_note:note,p_next_due:input.next_due}));if(f.quote_id!==key)protocol();return legacyFollowup(f)},
  async dashboard(who,today){scoped(who);if(!validDay(today))bad('invalid_date');const d=row(await rpc('fk_dashboard',{p_today:today}));for(const key of ['customers','pending','due','amount_satang'])if(!Number.isSafeInteger(d[key])||d[key]<0)protocol();if(d.today!==today)protocol();return d},
  async exportAccount(who){scoped(who);const d=row(await rpc('fk_export_account'));if(d.account?.id!==owner||d.format!=='followkit-account-export'||d.version!==1)protocol();for(const key of ['customers','quotes','followups','subscriptions']){if(!Array.isArray(d[key]))protocol();d[key].forEach(owned)}return {...d,followups:d.followups.map(legacyFollowup)}}
 };
}
export function httpRepositoryFactory(config){return ({identity,request})=>createHttpRepository({...config,owner:identity.id,authorization:request.headers.get('authorization')})}
