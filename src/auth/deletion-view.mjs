export function mountDeletion({root=document,api,enabled=false,onAccepted=()=>{}}){
 if(!enabled)return {clear(){},showStatus(){}};
 const make=(tag,text)=>{const e=root.createElement(tag);e.textContent=text;return e};
 const open=make('button','ขอลบบัญชี'),dialog=make('dialog',''),title=make('h2','ยืนยันคำขอลบบัญชี');open.type='button';title.id='deletion-title';dialog.setAttribute('aria-labelledby',title.id);
 const info=make('p','เมื่อรับคำขอแล้ว บัญชีจะถูกปิดการเข้าถึงและไม่สามารถยกเลิกคำขอได้ การลบอาจใช้เวลา หากต้องการเก็บข้อมูล ให้ส่งออกก่อนดำเนินการ');
 const recent=make('p','กรุณาเข้าสู่ระบบด้วยรหัสผ่านภายใน 5 นาทีที่ผ่านมา แล้วพิมพ์ DELETE MY ACCOUNT เพื่อยืนยัน');
 const form=make('form',''),label=make('label','ข้อความยืนยัน'),input=make('input',''),send=make('button','ยืนยันคำขอลบ'),cancel=make('button','ยกเลิก'),status=make('p','');
 input.id='deletion-confirmation';input.autocomplete='off';label.htmlFor=input.id;send.type='submit';cancel.type='button';status.setAttribute('role','status');send.disabled=true;
 const panel=make('section',''),check=make('button','ตรวจสถานะคำขอลบ'),progress=make('p','');panel.hidden=true;check.type='button';progress.setAttribute('role','status');panel.append(check,progress);
 (root.getElementById('account-status')||root.getElementById('workspace')).after(panel);
 let checking=false;
 check.onclick=async()=>{if(checking)return;checking=true;check.disabled=true;const stamp=generation;
  try{const r=await api.request('/api/account/deletion/status',{method:'POST',body:{}});if(stamp!==generation)return;
   const messages={none:'ไม่พบคำขอลบสำหรับบัญชีนี้',pending:'รับคำขอแล้ว กำลังดำเนินการหรือรอตรวจสอบ ยังไม่ยืนยันว่าลบเสร็จ',complete:'ระบบบันทึกว่าดำเนินการลบเสร็จแล้ว'};
   if(!messages[r?.state])throw Error('invalid');progress.textContent=messages[r.state];
  }catch{if(stamp===generation)progress.textContent='ยังตรวจสถานะไม่ได้ เซสชันอาจหมดอายุหรือถูกเพิกถอน กรุณาเข้าสู่ระบบใหม่หรือติดต่อผู้ดูแล ไม่ได้หมายความว่าลบเสร็จแล้ว';}
  finally{if(stamp===generation){checking=false;check.disabled=false}}
 };
 let busy=false,generation=0;const sync=()=>{send.disabled=busy||input.value!=='DELETE MY ACCOUNT';cancel.disabled=busy;input.disabled=busy};
 const clear=()=>{generation++;checking=false;check.disabled=false;panel.hidden=true;progress.textContent='';busy=false;input.value='';status.textContent='';if(dialog.open)dialog.close();sync()};
 open.onclick=()=>{clear();dialog.showModal();cancel.focus()};cancel.onclick=()=>{if(!busy){clear();open.focus()}};
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();else clear()});input.oninput=sync;
 form.onsubmit=async e=>{e.preventDefault();if(busy||input.value!=='DELETE MY ACCOUNT')return;busy=true;sync();const stamp=generation;
  try{const r=await api.request('/api/account/deletion',{method:'POST',body:{confirmation:input.value}});if(stamp!==generation)return;if(r?.accepted!==true)throw Error('unverified');clear();onAccepted();}
  catch{if(stamp===generation)status.textContent='ยังยืนยันผลไม่ได้ คำขออาจถูกรับแล้ว กรุณาตรวจสถานะกับผู้ดูแลก่อนลองใหม่';}
  finally{if(stamp===generation){busy=false;sync()}}
 };
 form.append(label,input,send,cancel);dialog.append(title,info,recent,form,status);root.getElementById('workspace').append(open,dialog);return {clear,showStatus(){panel.hidden=false}};
}
