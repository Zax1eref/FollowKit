// Server-only direct/session-pool connection. One fresh connection per operation.
// Client must be node-postgres >=8.16.3. Never expose this adapter as an SQL RPC.
const runtime='followkit_deletion_runtime', capability='followkit_deletion_executor';
export function deletionDatabase({Client,connectionString,projectRef,ca}) {
 if(typeof Client!=='function'||!/^[a-z]{20}$/.test(projectRef||''))throw Error('invalid_deletion_database_configuration');
 let url;try{url=new URL(connectionString)}catch{throw Error('invalid_deletion_database_configuration')}
 const direct=url.hostname===`db.${projectRef}.supabase.co`;
 const pool=/^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname);
 let user,password;try{user=decodeURIComponent(url.username);password=decodeURIComponent(url.password)}catch{throw Error('invalid_deletion_database_configuration')}
 if(!['postgres:','postgresql:'].includes(url.protocol)||(!direct&&!pool)||url.port!=='5432'||url.pathname!=='/postgres'||url.search||url.hash||!password||user!==(direct?runtime:`${runtime}.${projectRef}`)|| (ca!==undefined&&(typeof ca!=='string'||!ca.includes('BEGIN CERTIFICATE'))))throw Error('invalid_deletion_database_configuration');
 const config=Object.freeze({host:url.hostname,port:5432,database:'postgres',user,password,
  ssl:{rejectUnauthorized:true,...(ca?{ca}:{})},application_name:'followkit-deletion',
  connectionTimeoutMillis:2000,query_timeout:2500,statement_timeout:2000,lock_timeout:1000,
  idle_in_transaction_session_timeout:2000});
 return {async query(text,values=[]) {
  if(typeof text!=='string'||!text.trim()||!Array.isArray(values))throw Error('deletion_database_unavailable');
  let client,timer,failed=false;
  const task=async()=>{
   client=new Client({...config,ssl:{...config.ssl}});
   // Idle socket errors must not become unhandled events or leak credentials.
   client.on('error',()=>{failed=true});
   await client.connect();
   if(failed)throw Error('connection_failed');
   const identity=await client.query({text:`SELECT current_user AS role, session_user AS session_role,
    r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolreplication,
    pg_has_role(current_user,$1,'USAGE') AS executor
    FROM pg_roles r WHERE r.rolname=current_user`,values:[capability]});
   const r=identity.rows?.[0];
   if(identity.rows?.length!==1||r.role!==runtime||r.session_role!==runtime||r.executor!==true||['rolsuper','rolbypassrls','rolcreaterole','rolcreatedb','rolreplication'].some(k=>r[k]!==false)||failed)throw Error('wrong_role');
   // Extended protocol permits exactly one statement even with an empty values list.
   // Caller SQL is trusted source code; all user values remain parameters.
   const result=await client.query({text,values,queryMode:'extended'});
   if(failed||!Array.isArray(result?.rows))throw Error('query_failed');
   return result;
  };
  try{return await Promise.race([task(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('deadline')),7000)})]);}
  catch{throw Error('deletion_database_unavailable');}
  finally{clearTimeout(timer);failed=true;
   // Never reuse a connection after timeout. A lost response may have committed:
   // reconciliation belongs to the idempotent workflow, not an automatic SQL retry.
   if(client){try{await Promise.race([Promise.resolve(client.end()).catch(()=>{}),new Promise(resolve=>{const t=setTimeout(resolve,500);t.unref?.()})]);}catch{}}
  }
 }};
}
