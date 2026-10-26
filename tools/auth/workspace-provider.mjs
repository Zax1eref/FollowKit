// Test-only provider/data HTTP fixture. No actual provider or PostgreSQL persistence.
export function workspaceProvider(){
 const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
 const users=new Map([['a@example.test',{id:A,email:'a@example.test',email_confirmed_at:'2026-10-25'}],['b@example.test',{id:B,email:'b@example.test',email_confirmed_at:'2026-10-25'}]]);
 const C='55555555-5555-4555-8555-555555555555';users.set('blocked@example.test',{id:C,email:'blocked@example.test',email_confirmed_at:'2026-10-25'});const ready=new Set([B]),blocked=new Set([C]),stats={provisions:0};
 const customers=[],quotes=[],followups=[],dedup=new Map();
 const tokens=new Map();const token=id=>{if(!tokens.has(id))tokens.set(id,Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture');return tokens.get(id)};
 const failure=message=>Response.json({message},{status:400});
 const fetcher=async(input,init={})=>{
  const u=new URL(String(input));if(u.origin!=='https://db.test')throw Error('Unexpected fixture origin');const body=init.body?JSON.parse(init.body):{};const headers=new Headers(init.headers);const bearer=headers.get('authorization')?.replace('Bearer ','');const user=[...users.values()].find(x=>token(x.id)===bearer);
  if(u.pathname==='/auth/v1/token'){const who=users.get(body.email)||user;if(!who)return Response.json({error:'invalid_credentials'},{status:400});return Response.json({user:who,access_token:token(who.id),refresh_token:'fixture-refresh',expires_in:3600,token_type:'bearer'})}
  if(u.pathname==='/auth/v1/logout')return new Response(null,{status:204});
  if(!user)return new Response('{}',{status:401});const owner=user.id;
  if(u.pathname==='/auth/v1/user')return Response.json(user);
  if(u.pathname==='/rest/v1/fk_accounts')return Response.json(ready.has(owner)?[{id:owner,plan:'free',state:'active'}]:[]);
  const owned=rows=>rows.filter(row=>row.account_id===owner);
  if(['/rest/v1/fk_customers','/rest/v1/fk_quotes'].includes(u.pathname)){if(u.searchParams.get('account_id')!=='eq.'+owner)throw Error('Missing owner filter');const rows=owned(u.pathname.endsWith('customers')?customers:quotes);return Response.json(rows,{headers:{'Content-Range':rows.length?'0-'+(rows.length-1)+'/'+rows.length:'*/0'}})}
  const name=u.pathname.split('/').at(-1);
  if(name==='fk_onboarding_status')return Response.json({status:blocked.has(owner)?'blocked':ready.has(owner)?'ready':'setup_required'});
  if(name==='fk_provision_account'){if(blocked.has(owner))return failure('account_blocked');if(body.p_confirm!==true)return failure('confirmation_required');if(!ready.has(owner)){ready.add(owner);stats.provisions++}return Response.json({id:owner,plan:'free'})}
  if(name==='fk_dashboard'){const pending=owned(quotes).filter(q=>q.status==='pending');return Response.json({customers:owned(customers).length,pending:pending.length,due:pending.filter(q=>q.due_on<=body.p_today).length,amount_satang:pending.reduce((sum,q)=>sum+q.amount_satang,0),today:body.p_today})}
  if(name==='fk_save_customer'){let c=owned(customers).find(c=>c.id===body.p_id);if(!c){c={id:crypto.randomUUID(),account_id:owner};customers.push(c)}Object.assign(c,{name:body.p_name,contact:body.p_contact});return Response.json(c)}
  if(name==='fk_create_quote_scoped'){const key=owner+body.p_key;if(dedup.has(key))return Response.json(dedup.get(key));const q={id:crypto.randomUUID(),account_id:owner,customer_id:body.p_customer_id,title:body.p_title,amount_satang:body.p_amount,sent_on:body.p_sent,due_on:body.p_due,status:body.p_status};quotes.push(q);dedup.set(key,q);return Response.json(q)}
  if(name==='fk_patch_quote'){const q=owned(quotes).find(q=>q.id===body.p_id);if(!q)return failure('not_found');Object.assign(q,body.p_patch);return Response.json(q)}
  if(name==='fk_followup'){const q=owned(quotes).find(q=>q.id===body.p_quote_id);if(!q)return failure('not_found');q.due_on=body.p_next_due;const f={id:crypto.randomUUID(),account_id:owner,quote_id:q.id,note:body.p_note,next_due:body.p_next_due};followups.push(f);return Response.json(f)}
  if(name==='fk_followups_json')return Response.json(owned(followups).filter(f=>f.quote_id===body.p_id));
  if(name==='fk_delete_customer'){if(owned(quotes).some(q=>q.customer_id===body.p_id))return failure('customer_has_quotes');const i=customers.findIndex(c=>c.account_id===owner&&c.id===body.p_id);if(i>=0)customers.splice(i,1);return new Response(null,{status:204})}
  if(name==='fk_delete_quote'){const i=quotes.findIndex(q=>q.account_id===owner&&q.id===body.p_id);if(i>=0)quotes.splice(i,1);return new Response(null,{status:204})}
  throw Error('Unexpected fixture endpoint');
 };
 return {fetcher,customers,quotes,users,stats};
}
