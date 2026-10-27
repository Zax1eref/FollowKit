// Internal composition only. Requires a bounded-timeout primary autocommit DB
// connection and server-owned Auth client. No public endpoint or credential setup.
import {deletionAdmission} from './deletion-admission.mjs';
import {deletionStatus} from './deletion-status.mjs';
import {deletionWorkflow} from './deletion-workflow.mjs';
import {deletionSessions,deletionSessionInspector} from './deletion-sessions.mjs';
import {deletionFreeBilling} from './deletion-billing.mjs';
import {deletionAuth} from './deletion-auth.mjs';
import {deletionReadiness} from './deletion-readiness.mjs';
import {deletionCompletion} from './deletion-completion.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function deletionService({database,auth,archive,issuer,billingMode}) {
 if(billingMode!=='no_provider_ever_enabled'||typeof archive?.retain!=='function'||typeof database?.query!=='function'||typeof auth?.admin?.signOut!=='function'||typeof auth?.admin?.getUserById!=='function'||typeof auth?.admin?.deleteUser!=='function')throw Error('invalid_deletion_service_configuration');
 const admission=deletionAdmission({auth,database,issuer}),status=deletionStatus({auth,database,issuer});
 async function execute({jobId,accessToken}={}) {
  let job;
  try {
   if(jobId!==undefined&&!uuid.test(jobId))throw Error('invalid_job');
   const r=jobId===undefined?await database.query('SELECT * FROM followkit_private.claim_deletion_job()'):await database.query(`WITH candidate AS (
    SELECT id FROM followkit_private.deletion_jobs WHERE id=$1::uuid AND completed_at IS NULL
    AND next_attempt_at<=clock_timestamp() AND (lease_until IS NULL OR lease_until<=clock_timestamp())
    FOR UPDATE SKIP LOCKED LIMIT 1)
    UPDATE followkit_private.deletion_jobs j SET lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes',attempts=j.attempts+1
    FROM candidate c WHERE j.id=c.id RETURNING j.*`,[jobId]);
   if(r.rows.length===0)return {idle:true};
   job=r.rows[0];if(r.rows.length!==1||!uuid.test(job.id)||!uuid.test(job.subject_id)||!uuid.test(job.lease_token))throw Error('invalid_claim');
  }catch{return {completed:false,pending:true,stage:'claim'};}
  const leaseToken=job.lease_token,context=Object.freeze({jobId:job.id,owner:job.subject_id});
  async function loadConfirmed(id){
   if(id!==context.jobId)throw Error('wrong_job');
   const r=await database.query(`SELECT id,subject_id FROM followkit_private.deletion_jobs
    WHERE id=$1::uuid AND subject_id=$2::uuid AND lease_token=$3::uuid AND lease_until>clock_timestamp() AND completed_at IS NULL`,[id,context.owner,leaseToken]);
   if(r.rows.length!==1)throw Error('lease_lost');return {id,owner:context.owner,confirmed:true};
  }
  async function record(column){
   // column is selected exclusively by fixed internal callers below.
   const r=await database.query(`UPDATE followkit_private.deletion_jobs SET ${column}=clock_timestamp()
    WHERE id=$1::uuid AND subject_id=$2::uuid AND lease_token=$3::uuid AND lease_until>clock_timestamp() AND completed_at IS NULL RETURNING id`,[context.jobId,context.owner,leaseToken]);
   if(r.rows.length!==1)throw Error('lease_lost');
  }
  const inspect=deletionSessionInspector({database,leaseToken});
  const sessions=deletionSessions({auth,inspect,accessToken});
  const identity=deletionAuth({admin:auth.admin,readiness:deletionReadiness({database,leaseToken})});
  const workflow=deletionWorkflow({
   jobs:{loadConfirmed,complete:deletionCompletion({database,leaseToken})},
   archive:{async retain(owner){if(owner!==context.owner)throw Error('wrong_owner');await loadConfirmed(context.jobId);
    let timer;try{const result=await Promise.race([archive.retain(owner),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('archive_timeout')),10000)})]);
     if(result?.retained!==true)throw Error('unretained');await record('archive_verified_at');return {retained:true};
    }finally{clearTimeout(timer)}}},
   effects:{
    blockAccess:async()=>({done:(await inspect(context)).ready===true}),
    revokeSessions:async()=>{await sessions.revokeSessions(context);await record('sessions_revoked_at');return {done:true}},
    settleBilling:deletionFreeBilling({database,leaseToken,billingMode}),
    purgeData:async()=>{const r=await database.query('SELECT followkit_private.purge_deletion_app($1::uuid,$2::uuid) AS done',[context.jobId,leaseToken]);return {done:r.rows?.length===1&&r.rows[0].done===true}},
    removeIdentity:identity.removeIdentity
   }
  });
  const result=await workflow.run(context.jobId);
  if(!result.completed){try{const r=await database.query('SELECT followkit_private.retry_deletion_job($1::uuid,$2::uuid,$3::text) AS released',[context.jobId,leaseToken,result.stage]);return {...result,retryScheduled:r.rows?.[0]?.released===true};}catch{return {...result,retryScheduled:false}}}
  return result;
 }
 return {
  async confirm(input){const accepted=await admission.confirm(input);await execute({jobId:accepted.jobId,accessToken:input.accessToken});return accepted;},
  status:status.status,
  // Trusted scheduler/operator only. No token persisted and no unbounded loop.
  runNext:()=>execute()
 };
}
