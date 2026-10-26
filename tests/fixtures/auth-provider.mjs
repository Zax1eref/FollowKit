// Local fixture only. No network, storage, passwords retained or production import.
export function fixtureAuth(){let listener=()=>{},session=null;const user={id:'11111111-1111-4111-8111-111111111111',email:'demo@example.test',email_confirmed_at:'2026-10-25'};return {
 onAuthStateChange(fn){listener=fn;return {data:{subscription:{unsubscribe(){listener=()=>{}}}}}},
 async signInWithPassword({email,password}){if(email!=='demo@example.test'||password!=='demo-password-123')return {error:{message:'fixture only'}};session={user};listener('SIGNED_IN',session);return {data:{session}}},
 async signUp(){return {data:{session:null}}},async resetPasswordForEmail(){return {data:{}}},
 async updateUser(){return {data:{user}}},async signOut(){session=null;listener('SIGNED_OUT',null);return {error:null}},
 recover(){session={user};listener('PASSWORD_RECOVERY',session)}
}}
