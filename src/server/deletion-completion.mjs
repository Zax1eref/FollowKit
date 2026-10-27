const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Use only a server-owned connection in autocommit mode: success requires commit.
export function deletionCompletion({database,leaseToken}) {
 if(typeof database?.query!=='function'||!uuid.test(leaseToken||''))throw Error('invalid_deletion_completion_configuration');
 return async context=>{try{
  if(!uuid.test(context?.jobId||'')||!uuid.test(context?.owner||''))throw Error('invalid');
  const r=await database.query('SELECT followkit_private.complete_deletion_job($1::uuid,$2::uuid,$3::uuid) AS done',[context.jobId,context.owner,leaseToken]);
  if(r.rows?.length!==1||r.rows[0].done!==true)throw Error('incomplete');
  return {done:true};
 }catch{throw Error('deletion_completion_pending');}};
}
