// Server-only adapter. Never import into the public app or supply a browser admin client.
// readiness must validate current durable job/owner/lease, tombstone, archive,
// session revocation, billing settlement and app-purge completion from trusted storage.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function deletionAuth({admin,readiness,timeoutMs=10000}) {
 if(typeof admin?.getUserById!=='function'||typeof admin?.deleteUser!=='function'||typeof readiness!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('invalid_deletion_auth_configuration');
 async function bounded(call){let timer;try{return await Promise.race([Promise.resolve().then(call),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),timeoutMs)})]);}finally{clearTimeout(timer)}}
 async function state(owner){
  const result=await bounded(()=>admin.getUserById(owner));
  if(result?.error?.status===404&&result.error.code==='user_not_found'&&!result.data?.user)return 'absent';
  if(!result?.error&&result?.data?.user?.id===owner)return 'present';
  throw Error('unverified');
 }
 return {async removeIdentity(context){
  try {
   if(!uuid.test(context?.jobId||'')||!uuid.test(context?.owner||''))throw Error('invalid');
   const target=Object.freeze({jobId:context.jobId,owner:context.owner});
   if(await bounded(()=>readiness(target))!==true)throw Error('not_ready');
   if(await state(target.owner)==='absent')return {done:true};
   // Revalidate after the network read; do not act on a lease that expired during it.
   if(await bounded(()=>readiness(target))!==true)throw Error('not_ready');
   // A DELETE acknowledgement alone never proves erasure. An error may be a lost
   // response: read back if the request settled; a timeout stays pending for retry.
   await bounded(async()=>{try{await admin.deleteUser(target.owner,false)}catch{/* Verify below. */}});
   if(await state(target.owner)!=='absent')throw Error('still_present');
   return {done:true};
  }catch{throw Error('deletion_identity_pending');}
 }};
}
