// Per-process authenticated-user limiter. Production edge/IP limits are separate.
export function createRateLimiter({now=()=>Date.now(),windowMs=60000,readLimit=120,writeLimit=30,maxKeys=10000}={}){
 const windows=new Map();return (owner,method)=>{const time=now();for(const [key,w] of windows)if(w.until<=time)windows.delete(key);const bucket=['GET','HEAD'].includes(method)?'read':'write';const key=JSON.stringify([owner,bucket]);let window=windows.get(key);if(!window){if(windows.size>=maxKeys)return {allowed:false,retryAfter:60};window={count:0,until:time+windowMs};windows.set(key,window)}const limit=bucket==='read'?readLimit:writeLimit;if(window.count>=limit)return {allowed:false,retryAfter:Math.max(1,Math.ceil((window.until-time)/1000))};window.count++;return {allowed:true};};
}
