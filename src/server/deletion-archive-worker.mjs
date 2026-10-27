import {WorkerEntrypoint} from 'cloudflare:workers';
import {deletionArchive} from './deletion-archive.mjs';

// Only a trusted deletion orchestrator may receive a binding to this entrypoint.
// It must authorize deletion before calling retain; this is not a user API.
export class DeletionArchive extends WorkerEntrypoint {
 async retain(subject) {
  return deletionArchive({bucket:this.env.DELETION_ARCHIVE,source:this.env.ARCHIVE_SOURCE}).retain(subject);
 }
}
export default {
 fetch() { return new Response('not_found',{status:404,headers:{'Cache-Control':'no-store'}}); }
};
