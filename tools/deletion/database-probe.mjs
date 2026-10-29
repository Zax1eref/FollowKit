import {WorkerEntrypoint} from 'cloudflare:workers';
import pg from 'pg';
import {deletionDatabase} from '../../src/server/deletion-database.mjs';
export class DeletionDatabaseProbe extends WorkerEntrypoint {
 async verify() {
  try{
   const db=deletionDatabase({Client:pg.Client,connectionString:this.env.DELETION_DATABASE_URL,projectRef:this.env.DELETION_PROJECT_REF,ca:this.env.DELETION_DATABASE_CA});
   const r=await db.query(`SELECT
    has_column_privilege(current_user,'auth.users','id','SELECT')
    AND has_column_privilege(current_user,'auth.sessions','id','SELECT')
    AND NOT has_column_privilege(current_user,'auth.users','email','SELECT')
    AND NOT has_table_privilege(current_user,'auth.users','DELETE')
    AND NOT has_table_privilege(current_user,'followkit_private.account_tombstones','DELETE') AS limited,
    (SELECT count(*)=0 FROM followkit_private.deletion_jobs) AS empty_queue`);
   return {passed:r.rows?.length===1&&r.rows[0].limited===true&&r.rows[0].empty_queue===true,scope:'deletion_database_read_only',productionDeletionWritten:false};
  }catch{return {passed:false,scope:'deletion_database_read_only',productionDeletionWritten:false}}
 }
}
export default {fetch(){return new Response('Not found',{status:404})}};
