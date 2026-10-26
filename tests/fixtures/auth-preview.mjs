import {mountAuth} from '/auth/view.mjs';import {fixtureAuth} from '/fixtures/auth-provider.mjs';
const auth=fixtureAuth();mountAuth({auth,origin:'https://app.test'});
document.getElementById('notice').textContent='ทดสอบเท่านั้น • ไม่ส่งอีเมล • demo@example.test / demo-password-123';
const button=document.createElement('button');button.textContent='จำลองเปิดลิงก์กู้รหัสผ่าน';button.id='simulate-recovery';button.onclick=()=>auth.recover();document.querySelector('footer').append(button);
