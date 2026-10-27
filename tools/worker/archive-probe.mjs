// Local-only caller. No owner, key, body or RPC method is accepted from the request.
export default {
 async fetch(request,env) {
  const url=new URL(request.url);
  if(url.hostname!=='127.0.0.1'||url.pathname!=='/probe'||request.method!=='POST'||request.headers.has('Origin')||request.headers.get('X-FollowKit-Probe')!=='1')return new Response('not_found',{status:404});
  try {
   const result=await env.ARCHIVE.verifyStorage();
   return Response.json(result,{headers:{'Cache-Control':'no-store'}});
  }catch{
   return Response.json({passed:false,scope:'remote_archive_storage_probe',error:'archive_probe_failed'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
 }
};
