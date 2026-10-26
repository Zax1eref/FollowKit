// Local test-only HTTP bridge. No production authentication is provided here.
import {createServer} from 'node:http';import {readFileSync,mkdirSync} from 'node:fs';import {Store} from './store.mjs';import {createTestHarness} from './test-harness.mjs';
if(!process.argv.includes('--synthetic-accounts')||process.env.NODE_ENV==='production')throw Error('Run only with --synthetic-accounts for local fake data');
mkdirSync('.local',{recursive:true});const store=new Store('.local/test.sqlite');
const handler=createTestHarness({store,html:readFileSync('dist/index.html','utf8'),enabled:true});
const server=createServer(async(req,res)=>{try{let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>16384){res.writeHead(413,{'Content-Type':'application/json'});res.end('{"error":{"code":"body_too_large"}}');return}chunks.push(c)}const body=Buffer.concat(chunks);const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers:req.headers,...(body.length?{body}:{} )});const response=await handler(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))}catch{res.writeHead(500,{'Content-Type':'application/json'});res.end('{"error":{"code":"internal_error"}}')}});
const argument=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1]};
const host=argument('--host')||'127.0.0.1';if(!['127.0.0.1','0.0.0.0'].includes(host))throw Error('Unsupported preview host');
server.requestTimeout=10000;server.headersTimeout=10000;server.listen(Number(argument('--port')||process.env.PORT||4173),host,()=>console.log('FollowKit TEST ONLY — synthetic A/B accounts; no real data'));
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>server.close(()=>{store.close();process.exit(0)}));
