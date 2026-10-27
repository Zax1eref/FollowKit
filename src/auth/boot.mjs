import {mountDeletion} from './deletion-view.mjs';
import {createClient} from '@supabase/supabase-js';
import {mountWorkspace} from '../workspace/view.mjs';
import {mountAuth} from './view.mjs';
import {authConfiguration,completeCallback,createAccountBridge} from './session.mjs';
const status=document.getElementById('status'),accountStatus=document.getElementById('account-status');
let deletion,bridge,controller,client,workspace,ready=false,reading=false,sequence=0,provisioning=false;
const clear=reason=>{sequence++;reading=false;provisioning=false;document.getElementById('onboarding').hidden=true;accountStatus.textContent=reason==='unauthorized'?'เซสชันหมดอายุ กรุณาออกจากระบบและเข้าสู่ระบบใหม่':['account_unavailable','account_blocked'].includes(reason)?'บัญชียังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแล':'';workspace?.clear();deletion?.clear()};
function sync(state){
 if(state.view!=='signed_in'||state.busy){bridge?.clear();return}
 if(!ready||reading)return;
 reading=true;const current=++sequence;
 bridge.request('/api/onboarding').then(async result=>{
  if(current!==sequence||controller.getState().view!=='signed_in')return;
  document.getElementById('onboarding').hidden=result.status!=='setup_required';
  if(result.status==='setup_required'){accountStatus.textContent='ยืนยันอีเมลแล้ว กรุณายืนยันสร้างพื้นที่ทำงาน';return}
  if(result.status!=='ready'){accountStatus.textContent='บัญชีนี้ถูกระงับการเปิดใช้งาน กรุณาติดต่อผู้ดูแล';workspace.clear();deletion?.showStatus();return}
  const account=await bridge.load();if(current===sequence&&controller.getState().view==='signed_in'){accountStatus.textContent='เชื่อมบัญชีแล้ว · แผน '+account.plan;workspace.start()}
 }).catch(()=>{if(current===sequence&&controller.getState().view==='signed_in')accountStatus.textContent='ยังตรวจสอบบัญชีไม่ได้ กรุณาลองเข้าสู่ระบบใหม่'}).finally(()=>{if(current===sequence)reading=false});
}
try{
 const response=await fetch('/auth/config',{credentials:'omit',cache:'no-store',redirect:'error'});
 if(!response.ok)throw Error('not_configured');
 const config=authConfiguration(await response.json(),location.origin);
 client=createClient(config.url,config.publishableKey,{global:{fetch:(input,init)=>{const target=new URL(typeof input==='string'?input:input.url||String(input));if(target.origin!==config.url||!target.pathname.startsWith('/auth/v1/'))throw Error('provider_origin_rejected');return fetch(input,{...init,credentials:'omit',redirect:'error'})}},auth:{flowType:'pkce',detectSessionInUrl:false,persistSession:true,autoRefreshToken:true,storage:localStorage,storageKey:'followkit-'+new URL(config.url).hostname}});
 bridge=createAccountBridge({auth:client.auth,origin:config.appOrigin,onClear:clear});
 workspace=mountWorkspace({api:bridge});
 deletion=mountDeletion({api:bridge,enabled:config.deletionEnabled===true,onAccepted:()=>{workspace.clear();deletion.showStatus();accountStatus.textContent='รับคำขอลบบัญชีแล้ว บัญชีถูกปิดการเข้าถึงระหว่างดำเนินการ ยังไม่ใช่การยืนยันว่าลบเสร็จ';}});
 controller=mountAuth({auth:client.auth,origin:config.appOrigin,isLocked:()=>!ready,onState:()=>queueMicrotask(()=>{if(controller)sync(controller.getState())})});
 // Disable interactions until callback exchange has completed. SDK callbacks are synchronous-only.
 for(const el of document.querySelectorAll('button,input'))el.disabled=true;
 try{await completeCallback({auth:client.auth,href:location.href,origin:config.appOrigin,replace:path=>history.replaceState(null,'',path)})}
 catch{const result=await client.auth.signOut({scope:'local'});if(result.error)throw Error('callback_failed');controller.navigate('login');status.textContent='ลิงก์ไม่ถูกต้องหรือหมดอายุ กรุณาขอลิงก์ใหม่ในเบราว์เซอร์เดิม'}
 document.getElementById('start-account').onclick=async()=>{
  if(provisioning||document.getElementById('onboarding').hidden||controller.getState().view!=='signed_in')return;
  provisioning=true;reading=true;const current=sequence;const button=document.getElementById('start-account');button.disabled=true;
  try{await bridge.request('/api/onboarding',{method:'POST',body:{confirm:true}});if(current===sequence){document.getElementById('onboarding').hidden=true;reading=false;sync(controller.getState())}}
  catch{if(current===sequence)accountStatus.textContent='ยังยืนยันการสร้างพื้นที่ทำงานไม่ได้ กดลองอีกครั้งได้อย่างปลอดภัย'}
  finally{if(current===sequence){provisioning=false;reading=false;button.disabled=false}}
 };
 ready=true;for(const el of document.querySelectorAll('button,input'))el.disabled=false;
 sync(controller.getState());
 window.addEventListener('pagehide',()=>{bridge.dispose();controller.dispose();client.auth.stopAutoRefresh()},{once:true});
}catch{
 // No credentials or provider error details in the UI/logs.
 bridge?.dispose();controller?.dispose();client?.auth.stopAutoRefresh();
 if(location.search||location.hash)history.replaceState(null,'','/auth/');
 status.textContent='ระบบยืนยันตัวตนยังไม่พร้อม กรุณาลองใหม่ภายหลัง';
 for(const el of document.querySelectorAll('button,input'))el.disabled=true;
}
