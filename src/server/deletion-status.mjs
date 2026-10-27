const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const deletionStatusSql=`SELECT
 EXISTS(SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
 WHERE s.id=$2::uuid AND s.user_id=$1::uuid AND (s.not_after IS NULL OR s.not_after>clock_timestamp())
 AND u.email_confirmed_at IS NOT NULL AND u.is_anonymous IS FALSE) AS authorized,
 (SELECT CASE WHEN j.completed_at IS NULL THEN 'pending' ELSE 'complete' END
 FROM followkit_private.deletion_jobs j WHERE j.subject_id=$1::uuid) AS state`;
export function deletionStatus({auth,database,issuer,now=()=>Date.now()}){
 if(typeof auth?.getClaims!=='function'||typeof auth?.getUser!=='function'||typeof database?.query!=='function'||!/^https:\/\/[-a-z0-9]+\.supabase\.co\/auth\/v1$/.test(issuer||''))throw Error('invalid_deletion_status_configuration');
 async function bounded(fn){let t;try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{t=setTimeout(()=>reject(Error('timeout')),10000)})]);}finally{clearTimeout(t)}}
 return {async status({accessToken}){try{
  if(typeof accessToken!=='string'||!accessToken||accessToken.length>16384)throw Error('invalid');
  const v=await bounded(()=>auth.getClaims(accessToken)),c=v?.data?.claims;
  if(v?.error||c?.iss!==issuer||c.aud!=='authenticated'||c.role!=='authenticated'||c.is_anonymous!==false||!uuid.test(c.sub||'')||!uuid.test(c.session_id||'')||!Number.isSafeInteger(c.exp)||c.exp<=Math.floor(now()/1000))throw Error('unauthorized');
  const u=await bounded(()=>auth.getUser(accessToken));if(u?.error||u?.data?.user?.id!==c.sub)throw Error('unauthorized');
  const r=await bounded(()=>database.query(deletionStatusSql,[c.sub,c.session_id]));
  if(r.rows?.length!==1||r.rows[0].authorized!==true)throw Error('unauthorized');
  const state=r.rows[0].state===null?'none':r.rows[0].state;if(!['none','pending','complete'].includes(state))throw Error('invalid');
  return {state};
 }catch{throw Error('deletion_status_unavailable');}}};
}
