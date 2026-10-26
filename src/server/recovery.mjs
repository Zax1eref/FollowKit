// Operator-only local snapshot tools. Never exposed over HTTP.
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,linkSync,chmodSync,statSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {Store} from './store.mjs';
export function verifyDatabase(path){
 const db=new DatabaseSync(path,{readOnly:true});
 try{
  const integrity=db.prepare('PRAGMA integrity_check').all();
  if(integrity.length!==1||Object.values(integrity[0])[0]!=='ok')throw Error('database_integrity_failed');
  if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('database_foreign_keys_failed');
  const expected=new Store();
  try{
   const schema=d=>JSON.stringify(d.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all());
   if(schema(db)!==schema(expected.db))throw Error('database_schema_mismatch');
  }finally{expected.close()}
  const counts={};for(const table of ['accounts','customers','quotes','followup_events','subscriptions','payment_events','request_dedup'])counts[table]=db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
  return {verified:true,counts};
 }finally{db.close()}
}
export function snapshotDatabase(source,destination){
 source=resolve(source);destination=resolve(destination);
 if(source===destination)throw Error('destination_must_be_new');
 if(!statSync(source).isFile())throw Error('source_not_regular_file');
 // Build in a private sibling directory; link publishes complete bytes atomically
 // and fails if the destination already exists (including a symlink).
 const dir=mkdtempSync(join(dirname(destination),'.followkit-snapshot-'));
 const stage=join(dir,'snapshot.sqlite');let db;
 try{
  db=new DatabaseSync(source,{readOnly:true});
  db.prepare('VACUUM INTO ?').run(stage);db.close();db=null;
  const result=verifyDatabase(stage);chmodSync(stage,0o600);linkSync(stage,destination);
  return {...result,path:destination};
 }finally{db?.close();rmSync(dir,{recursive:true,force:true})}
}
export const restoreDatabase=snapshotDatabase;
