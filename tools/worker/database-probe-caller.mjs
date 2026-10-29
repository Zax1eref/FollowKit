// Local-only diagnostic: fixed RPC, no SQL/owner/token input accepted.
export default {async fetch(request,env){
 const u=new URL(request.url);
 if(u.hostname!=='127.0.0.1'||u.pathname!=='/probe'||u.search||request.method!=='POST'||request.headers.has('Origin')||request.headers.get('X-FollowKit-Probe')!=='1')return new Response('not_found',{status:404});
 const result={passed:false,scope:'deletion_database_read_only',productionDeletionWritten:false};
 try{const r=await env.DATABASE.verify();result.passed=r?.passed===true&&r.scope===result.scope&&r.productionDeletionWritten===false;}catch{}
 return Response.json(result,{status:result.passed?200:503,headers:{'Cache-Control':'no-store'}});
}};
