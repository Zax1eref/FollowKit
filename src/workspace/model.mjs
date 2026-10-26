export function createWorkspace({api,onChange=()=>{}}){
 let epoch=0,enabled=false,state;
 const empty=()=>({customers:[],quotes:[],customerCursor:null,quoteCursor:null,dashboard:null,busy:false,error:'',history:[]});
 const emit=patch=>{state={...state,...patch};onChange(state)};
 function clear(){epoch++;enabled=false;state=empty();onChange(state)}clear();
 async function reload(stamp=epoch){
  const [customers,quotes,dashboard]=await Promise.all([api.request('/api/customers?limit=100'),api.request('/api/quotes?limit=100'),api.request('/api/dashboard')]);
  if(stamp!==epoch||!enabled)return false;
  emit({customers:customers.items,customerCursor:customers.next_cursor,quotes:quotes.items,quoteCursor:quotes.next_cursor,dashboard,history:[]});return true;
 }
 async function action(work){if(!enabled||state.busy)return false;const stamp=epoch;emit({busy:true,error:''});try{await work(stamp);return stamp===epoch&&enabled}catch(e){if(stamp===epoch)emit({error:e.message});return false}finally{if(stamp===epoch)emit({busy:false})}}
 return {clear,getState:()=>state,async start(){if(enabled)return;enabled=true;await action(reload)},refresh:()=>action(reload),
 more(table){if(!['customers','quotes'].includes(table))return false;const cursor=table==='customers'?state.customerCursor:state.quoteCursor;if(!cursor)return false;return action(async stamp=>{const page=await api.request('/api/'+table+'?limit=100&cursor='+encodeURIComponent(cursor));if(stamp!==epoch)return;const seen=new Set(state[table].map(r=>r.id));emit({[table]:state[table].concat(page.items.filter(r=>!seen.has(r.id))),[table==='customers'?'customerCursor':'quoteCursor']:page.next_cursor})})},
 history(id){return action(async stamp=>{emit({history:[]});const result=await api.request('/api/quotes/'+encodeURIComponent(id)+'/followups');if(stamp===epoch)emit({history:result.items})})},
 mutate(path,options){return action(async stamp=>{await api.request(path,options);if(stamp!==epoch)return;try{await reload(stamp)}catch{if(stamp===epoch)emit({error:'saved_refresh_failed'})}})}
 };
}
