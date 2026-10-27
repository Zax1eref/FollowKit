// Internal admission service; no public Worker route is registered by this module.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function deletionAdmission({auth,database,issuer,now=()=>Date.now(),timeoutMs=10000}) {
 if(typeof auth?.getClaims!=='function'||typeof auth?.getUser!=='function'||typeof database?.query!=='function'||typeof issuer!=='string'||!/^https:\/\/[-a-z0-9]+\.supabase\.co\/auth\/v1$/.test(issuer)||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('invalid_deletion_admission_configuration');
 async function bounded(fn){let timer;try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),timeoutMs)})]);}finally{clearTimeout(timer)}}
 return {async confirm({accessToken,body}){try{
  // The browser never chooses a target owner. Exact phrase denotes irreversible intent.
  if(!body||Array.isArray(body)||Object.keys(body).length!==1||body.confirmation!=='DELETE MY ACCOUNT'||typeof accessToken!=='string'||accessToken.length<1||accessToken.length>16384)throw Error('invalid');
  const verified=await bounded(()=>auth.getClaims(accessToken));
  const c=verified?.data?.claims,seconds=Math.floor(now()/1000);
  if(verified?.error||!c||c.iss!==issuer||c.aud!=='authenticated'||c.role!=='authenticated'||c.is_anonymous!==false||!uuid.test(c.sub||'')||!uuid.test(c.session_id||'')||!Number.isSafeInteger(c.exp)||c.exp<=seconds)throw Error('unauthorized');
  // Refresh time (iat) and recovery/OTP links are NOT accepted as recent password login.
  const methods=Array.isArray(c.amr)?c.amr:[];
  const recent=methods.filter(x=>x?.method==='password'&&Number.isSafeInteger(x.timestamp)&&x.timestamp<=seconds&&x.timestamp>=seconds-300).map(x=>x.timestamp);
  if(!recent.length)throw Error('recent_auth_required');
  const user=await bounded(()=>auth.getUser(accessToken));
  if(user?.error||user?.data?.user?.id!==c.sub||!user.data.user.email_confirmed_at||user.data.user.is_anonymous!==false)throw Error('unauthorized');
  const result=await bounded(()=>database.query('SELECT followkit_private.admit_deletion($1::uuid,$2::uuid,$3::timestamptz) AS id',[c.sub,c.session_id,new Date(Math.max(...recent)*1000).toISOString()]));
  if(result.rows?.length!==1||!uuid.test(result.rows[0].id||''))throw Error('unconfirmed');
  return {accepted:true,jobId:result.rows[0].id};
 }catch{throw Error('deletion_admission_pending');}}};
}
