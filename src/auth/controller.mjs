// SDK contract controller. Authentication authority remains the provider and Worker.
export function createAuthController({auth,origin,onChange=()=>{}}){
 const base=new URL(origin);if(base.origin!==origin||base.protocol!=='https:')throw Error('Exact HTTPS app origin required');
 let state={view:'login',busy:false,message:'',email:''},epoch=0,disposed=false,recovery=false;
 const emit=patch=>{if(disposed)return;state={...state,...patch};onChange({...state})};
 const verified=session=>!!session?.user?.email_confirmed_at&&!session.user.is_anonymous;
 const sub=auth.onAuthStateChange((event,session)=>{
  if(disposed)return;
  if(event==='SIGNED_OUT'){epoch++;recovery=false;emit({view:'login',email:'',message:'ออกจากระบบแล้ว',busy:false});return}
  if(state.view==='logout_failed')return;
  if(event==='PASSWORD_RECOVERY'){epoch++;recovery=true;emit({view:'recovery',email:'',message:'ตั้งรหัสผ่านใหม่',busy:false});return}
  if(recovery)return;
  if(['INITIAL_SESSION','SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED'].includes(event))emit({view:verified(session)?'signed_in':'login',email:verified(session)?session.user.email||'':'',message:session&&!verified(session)?'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ':''});
 });
 async function run(action,input={}){
  if(disposed||state.busy)return false;
  if(!['login','signup','reset','update','logout'].includes(action))return false;
  if(action==='update'&&!recovery){emit({message:'เปิดลิงก์รีเซ็ตรหัสผ่านที่ถูกต้องก่อน'});return false}
  if(state.view==='logout_failed'&&action!=='logout')return false;
  const email=String(input.email||'').trim(),password=String(input.password||'');
  if(['login','signup','reset'].includes(action)&&!/^\S+@\S+\.\S+$/.test(email)){emit({message:'กรอกอีเมลให้ถูกต้อง'});return false}
  if(['signup','update'].includes(action)&&(password.length<12||password.length>128)){emit({message:'ใช้รหัสผ่าน 12–128 ตัวอักษร'});return false}
  if(action==='login'&&!password){emit({message:'กรอกรหัสผ่าน'});return false}
  const current=++epoch;emit({busy:true,message:''});
  try{
   let result;
   if(action==='login')result=await auth.signInWithPassword({email,password});
   if(action==='signup')result=await auth.signUp({email,password,options:{emailRedirectTo:origin+'/auth/callback'}});
   if(action==='reset')result=await auth.resetPasswordForEmail(email,{redirectTo:origin+'/auth/recovery'});
   if(action==='update')result=await auth.updateUser({password});
   if(action==='logout')result=await auth.signOut({scope:'global'});
   if(disposed||current!==epoch)return false;
   if(result?.error)throw Error('provider_failure');
   if(action==='login'){
    const session=result?.data?.session;
    emit({view:verified(session)?'signed_in':'login',email:verified(session)?session.user.email||'':'',message:verified(session)?'เข้าสู่ระบบแล้ว':'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ'});
   }
   if(action==='signup')emit({view:'login',email:'',message:'หากสมัครได้ โปรดตรวจอีเมลเพื่อยืนยันบัญชี'});
   if(action==='reset')emit({message:'หากมีบัญชีนี้ ระบบจะส่งลิงก์รีเซ็ตรหัสผ่านให้ โปรดตรวจอีเมล'});
   if(action==='update'){recovery=false;emit({view:'signed_in',message:'เปลี่ยนรหัสผ่านแล้ว กรุณาออกจากระบบและเข้าสู่ระบบใหม่'})}
   if(action==='logout'){recovery=false;emit({view:'login',email:'',message:'ออกจากระบบแล้ว'})}
   return true;
  }catch{
   if(!disposed&&current===epoch)emit({...(action==='logout'?{view:'logout_failed',email:''}:{}),message:action==='login'?'เข้าสู่ระบบไม่ได้ ตรวจอีเมลและรหัสผ่าน':action==='logout'?'ยังยืนยันการออกจากระบบไม่ได้ กรุณาลองอีกครั้ง':'ดำเนินการไม่สำเร็จ กรุณาลองใหม่ภายหลัง'});
   return false;
  }finally{if(current===epoch)emit({busy:false})}
 }
 return {run,getState:()=>({...state}),navigate(view){if(!state.busy&&!recovery&&state.view!=='logout_failed'&&['login','signup','reset'].includes(view))emit({view,message:'',email:''})},dispose(){disposed=true;epoch++;sub.data.subscription.unsubscribe()}};
}
