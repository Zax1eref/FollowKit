// Restricted server database connection only. No public RPC or client grants.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const identityReadinessSql=`
SELECT EXISTS (
 SELECT 1 FROM followkit_private.deletion_jobs j
 WHERE j.id=$1::uuid AND j.subject_id=$2::uuid AND j.lease_token=$3::uuid
 AND j.lease_until>clock_timestamp() AND j.completed_at IS NULL
 AND j.archive_verified_at IS NOT NULL AND j.sessions_revoked_at IS NOT NULL
 AND j.billing_settled_at IS NOT NULL AND j.app_purged_at IS NOT NULL
 AND EXISTS(SELECT 1 FROM followkit_private.account_tombstones t WHERE t.subject_id=j.subject_id)
 AND NOT EXISTS(SELECT 1 FROM public.fk_accounts a WHERE a.id=j.subject_id)
 AND NOT EXISTS(SELECT 1 FROM public.fk_customers c WHERE c.account_id=j.subject_id)
 AND NOT EXISTS(SELECT 1 FROM public.fk_quotes q WHERE q.account_id=j.subject_id)
 AND NOT EXISTS(SELECT 1 FROM public.fk_followups f WHERE f.account_id=j.subject_id)
 AND NOT EXISTS(SELECT 1 FROM public.fk_subscriptions s WHERE s.account_id=j.subject_id)
 AND NOT EXISTS(SELECT 1 FROM followkit_private.request_dedup d WHERE d.account_id=j.subject_id)
) AS ready`;
export function deletionReadiness({database,leaseToken}) {
 if(typeof database?.query!=='function'||typeof leaseToken!=='string'||!uuid.test(leaseToken))throw Error('invalid_deletion_readiness_configuration');
 // A token belongs to one claimed job execution. Do not replace it dynamically
 // with the database's current token: that would let stale workers impersonate it.
 return async context=>{
  if(typeof context?.jobId!=='string'||!uuid.test(context.jobId)||typeof context?.owner!=='string'||!uuid.test(context.owner))return false;
  try {
   const result=await database.query(identityReadinessSql,[context.jobId,context.owner,leaseToken]);
   return result?.rows?.length===1&&result.rows[0].ready===true;
  }catch{return false;}
 };
}
