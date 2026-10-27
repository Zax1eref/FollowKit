// Internal coordinator only; no HTTP route or production adapters are installed.
// jobs.loadConfirmed must return a durable, irrevocably confirmed deletion job,
// with its owner derived from trusted identity, never from caller request fields.
// All effects must be idempotent and scoped to this job's owner. Only jobs.complete
// may mark the job done, after independently verifying all completion conditions.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function deletionWorkflow({jobs,archive,effects}) {
 for(const [object,methods] of [[jobs,['loadConfirmed','complete']],[archive,['retain']],[effects,['blockAccess','settleBilling','removeIdentity','purgeData']]])
  for(const method of methods)if(typeof object?.[method]!=='function')throw Error('invalid_deletion_workflow_configuration');
 return {async run(jobId){
  if(typeof jobId!=='string'||!uuid.test(jobId))throw Error('invalid_deletion_job');
  let stage='load_confirmed';
  try {
   const job=await jobs.loadConfirmed(jobId);
   if(!job||job.id!==jobId||job.confirmed!==true||!uuid.test(job.owner||''))throw Error('unconfirmed');
   const context=Object.freeze({jobId,owner:job.owner});
   // Recheck archive even on retries: never trust a stale cached acknowledgement.
   stage='archive';
   if((await archive.retain(context.owner))?.retained!==true)throw Error('unretained');
   for(const method of ['blockAccess','settleBilling','removeIdentity','purgeData']) {
    stage=method;
    if((await effects[method](context))?.done!==true)throw Error('unfinished');
   }
   stage='complete';
   if((await jobs.complete(context))?.done!==true)throw Error('unfinished');
   return {completed:true};
  }catch{return {completed:false,pending:true,stage};}
 }};
}
