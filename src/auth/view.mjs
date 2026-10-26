import {createAuthController} from './controller.mjs';
export function mountAuth({auth,origin,root=document,onState=()=>{},isLocked=()=>false}){
 const $=id=>root.getElementById(id),form=$('auth-form');let view='login';
 const labels={login:'เข้าสู่ระบบ',signup:'สร้างบัญชี',reset:'ขอลิงก์รีเซ็ต',recovery:'ตั้งรหัสผ่านใหม่',signed_in:'เข้าสู่ระบบแล้ว',logout_failed:'กรุณาออกจากระบบอีกครั้ง'};
 const controller=createAuthController({auth,origin,onChange:s=>{
  if(view!==s.view){form.reset();view=s.view;$('heading').textContent=labels[view];$('heading').focus()}
  $('status').textContent=s.message;$('identity').textContent=s.email;
  const account=['signed_in','logout_failed'].includes(view);form.hidden=account;$('account').hidden=!account;
  $('email-field').hidden=view==='recovery';$('email').required=view!=='recovery';
  $('password-field').hidden=view==='reset';$('password').required=view!=='reset';$('password').minLength=view==='login'?1:12;$('password').autocomplete=view==='login'?'current-password':'new-password';
  $('submit').textContent=labels[view];$('nav').hidden=account||view==='recovery';
  for(const el of $('auth-card').querySelectorAll('button,input'))el.disabled=s.busy||isLocked();
  form.setAttribute('aria-busy',String(s.busy));onState(s);
 }});
 form.addEventListener('submit',async event=>{event.preventDefault();const input={email:$('email').value,password:$('password').value};$('password').value='';await controller.run(view==='recovery'?'update':view,input)});
 for(const b of root.querySelectorAll('[data-view]'))b.addEventListener('click',()=>controller.navigate(b.dataset.view));
 $('logout').addEventListener('click',()=>controller.run('logout'));
 controller.navigate('login');return controller;
}
