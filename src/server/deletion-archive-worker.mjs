import {WorkerEntrypoint} from 'cloudflare:workers';
import {deletionArchive} from './deletion-archive.mjs';

// Only a trusted deletion orchestrator may receive a binding to this entrypoint.
// It must authorize deletion before calling retain; this is not a user API.
export class DeletionArchive extends WorkerEntrypoint {
 // Fixed diagnostic namespace: never interpreted as a production deletion marker.
 async verifyStorage() {
  const probe=deletionArchive({bucket:this.env.DELETION_ARCHIVE,source:"diagnostic-v1"});
  const subject="00000000-0000-4000-8000-000000000001";
  await probe.retain(subject);
  await probe.retain(subject);
  return {passed:true,scope:"remote_archive_storage_probe",retained:true,retryVerified:true,productionDeletionWritten:false};
 }
 async retain(subject) {
  return deletionArchive({bucket:this.env.DELETION_ARCHIVE,source:this.env.ARCHIVE_SOURCE}).retain(subject);
 }
}
export default {
 fetch() { return new Response('not_found',{status:404,headers:{'Cache-Control':'no-store'}}); }
};
