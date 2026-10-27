const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Explicit server deployment mode, never request-controlled. Disable permanently
// when a payment provider is introduced until real reconciliation is implemented.
export function deletionFreeBilling({database,leaseToken,billingMode}) {
 if(billingMode!=='no_provider_ever_enabled'||typeof database?.query!=='function'||!uuid.test(leaseToken||''))throw Error('invalid_deletion_billing_configuration');
 return async context=>{try{
  if(!uuid.test(context?.jobId||'')||!uuid.test(context?.owner||''))throw Error('invalid');
  const r=await database.query('SELECT followkit_private.settle_free_deletion_billing($1::uuid,$2::uuid,$3::uuid) AS done',[context.jobId,context.owner,leaseToken]);
  if(r.rows?.length!==1||r.rows[0].done!==true)throw Error('unverified');
  return {done:true};
 }catch{throw Error('deletion_billing_pending');}};
}
