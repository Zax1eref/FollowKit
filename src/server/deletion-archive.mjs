// Operator-side building block only. Not imported by the public Worker or exposed as HTTP.
// Caller must already have verified deletion authority; never accept a browser-supplied owner.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unavailable=()=>Error('deletion_archive_unavailable');
export function deletionArchive({bucket,source,timeoutMs=10000}) {
 if(!bucket||typeof bucket.get!=='function'||typeof bucket.put!=='function'||!/^[-a-z0-9]{1,64}$/.test(source||'')||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('invalid_deletion_archive_configuration');
 async function read(key){
  const object=await bucket.get(key);if(!object)return null;
  if(!Number.isInteger(object.size)||object.size<1||object.size>4096||!object.body?.getReader)throw unavailable();
  const reader=object.body.getReader();let size=0;const chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){void reader.cancel().catch(()=>{});throw unavailable();}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return new TextDecoder().decode(bytes);
 }
 return {async retain(subject){
  if(typeof subject!=='string'||!uuid.test(subject))throw Error('invalid_deletion_subject');
  subject=subject.toLowerCase();
  const key=`tombstones/v1/${source}/${subject}.json`;
  const body=JSON.stringify({version:1,source,subject,action:'deny_restore'});
  let timer;
  const work=(async()=>{
   const existing=await read(key);
   if(existing!==null){if(existing!==body)throw Error('deletion_archive_conflict');return {retained:true};}
   // Conditional create, never overwrite. A lost acknowledgement is resolved by readback.
   try{await bucket.put(key,body,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json',cacheControl:'no-store'}});}catch{/* Verify the exact retained object before acknowledging success. */}
   const retained=await read(key);
   if(retained===null)throw unavailable();
   if(retained!==body)throw Error('deletion_archive_conflict');
   return {retained:true};
  })();
  try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(unavailable()),timeoutMs);})]);}
  catch(e){throw e?.message==='deletion_archive_conflict'?Error('deletion_archive_conflict'):unavailable();}
  finally{clearTimeout(timer);}
 }};
}
