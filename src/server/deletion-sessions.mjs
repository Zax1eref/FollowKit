// Server-only. Access token is transient input, never written into job storage.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function deletionSessions({auth,inspect,accessToken,timeoutMs=10000}) {
 if(typeof auth?.getUser!=='function'||typeof auth?.admin?.signOut!=='function'||typeof inspect!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('invalid_deletion_sessions_configuration');
 async function bounded(fn){let timer;try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),timeoutMs)})]);}finally{clearTimeout(timer)}}
 async function observe(context){const s=await bounded(()=>inspect(context));if(s?.ready!==true||!Number.isSafeInteger(s.activeSessions)||s.activeSessions<0)throw Error('not_ready');return s.activeSessions;}
 return {async revokeSessions(context){try{
  if(!uuid.test(context?.jobId||'')||!uuid.test(context?.owner||''))throw Error('invalid');
  const target=Object.freeze({jobId:context.jobId,owner:context.owner});
  if(await observe(target)===0)return {done:true};
  if(typeof accessToken!=='string'||accessToken.length<1||accessToken.length>16384)throw Error('missing_token');
  const verified=await bounded(()=>auth.getUser(accessToken));
  if(verified?.error||verified?.data?.user?.id!==target.owner)throw Error('identity_mismatch');
  if(await observe(target)===0)return {done:true};
  // SDK may suppress 401/403/404: never trust a null error as revocation evidence.
  await bounded(async()=>{try{await auth.admin.signOut(accessToken,'global')}catch{/* Inspect provider sessions below. */}});
  if(await observe(target)!==0)throw Error('sessions_remain');
  return {done:true};
 }catch{throw Error('deletion_sessions_pending');}}};
}

// Read-only managed Auth inspection. No direct mutation of auth.sessions.
export function deletionSessionInspector({database,leaseToken}) {
 if(typeof database?.query!=='function'||!uuid.test(leaseToken||''))throw Error('invalid_session_inspector_configuration');
 return async ({jobId,owner})=>{
  if(!uuid.test(jobId||'')||!uuid.test(owner||''))return {ready:false};
  try {
   const r=await database.query(`SELECT
    (j.completed_at IS NULL AND j.lease_token=$3::uuid AND j.lease_until>clock_timestamp()
     AND j.archive_verified_at IS NOT NULL
     AND EXISTS(SELECT 1 FROM followkit_private.account_tombstones t WHERE t.subject_id=j.subject_id)
     AND (EXISTS(SELECT 1 FROM public.fk_accounts a WHERE a.id=j.subject_id AND a.state='deleting')
          OR (j.app_purged_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.fk_accounts a WHERE a.id=j.subject_id)))) AS ready,
    (SELECT count(*)::integer FROM auth.sessions s WHERE s.user_id=j.subject_id) AS "activeSessions"
    FROM followkit_private.deletion_jobs j WHERE j.id=$1::uuid AND j.subject_id=$2::uuid`,[jobId,owner,leaseToken]);
   return r.rows?.length===1?r.rows[0]:{ready:false};
  }catch{return {ready:false};}
 };
}
