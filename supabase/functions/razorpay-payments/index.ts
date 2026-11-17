import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const env=(k:string)=>Deno.env.get(k)||"";
const url=env("SUPABASE_URL"),anonKey=env("SUPABASE_ANON_KEY"),serviceRoleKey=env("SUPABASE_SERVICE_ROLE_KEY"),kid=env("RAZORPAY_KEY_ID"),secret=env("RAZORPAY_KEY_SECRET");
async function hmac(s:string,m:string){const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(s),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const b=await crypto.subtle.sign("HMAC",k,new TextEncoder().encode(m));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("");}
function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({ok:false,error:"METHOD_NOT_ALLOWED"},405);
 if(!url||!anonKey||!serviceRoleKey||!kid||!secret)return json({ok:false,error:"PAYMENT_GATEWAY_NOT_CONFIGURED"},503);
 const authorization=req.headers.get("Authorization")||"";
 if(!/^Bearer\s+\S+$/i.test(authorization))return json({ok:false,error:"AUTH_REQUIRED"},401);
 // Authenticate the customer with anon key; never forward their JWT to the service-role client.
 const userClient=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization}}});
 const {data:authData,error:authError}=await userClient.auth.getUser();
 const user=authData?.user;
 if(authError||!user)return json({ok:false,error:"AUTH_REQUIRED"},401);
 // This client has service-role credentials only; no user Authorization header is attached.
 const admin=createClient(url,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
 let body:any;try{body=await req.json();}catch{return json({ok:false,error:"INVALID_JSON"},400);}
 if(body?.action==="create"){
  const oid=String(body.order_id||"").trim();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(oid))return json({ok:false,error:"ORDER_ID_REQUIRED"},400);
  const {data:o,error:oe}=await admin.from("orders").select("id,order_number,total,currency,status,user_id").eq("id",oid).eq("user_id",user.id).maybeSingle();
  if(oe)return json({ok:false,error:"ORDER_LOOKUP_FAILED"},500);
  if(!o)return json({ok:false,error:"ORDER_NOT_FOUND"},404);
  if(o.status!=="pending")return json({ok:false,error:"ORDER_NOT_PAYABLE"},409);
  const amount=Number(o.total),currency=String(o.currency||"").toUpperCase();
  if(!Number.isFinite(amount)||amount<=0||!/^[A-Z]{3}$/.test(currency))return json({ok:false,error:"INVALID_ORDER_AMOUNT"},422);
  const {data:ex,error:xe}=await admin.from("payments").select("id,gateway_order_id,status").eq("order_id",oid).eq("gateway","razorpay").eq("status","created").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(xe)return json({ok:false,error:"PAYMENT_LOOKUP_FAILED"},500);
  if(ex?.gateway_order_id)return json({ok:true,key_id:kid,razorpay_order_id:ex.gateway_order_id,payment_id:ex.id,amount,currency});
  const rr=await fetch("https://api.razorpay.com/v1/orders",{method:"POST",headers:{Authorization:"Basic "+btoa(kid+":"+secret),"Content-Type":"application/json"},body:JSON.stringify({amount:Math.round(amount*100),currency,receipt:o.order_number,notes:{ils_order_id:o.id,user_id:user.id},payment_capture:1})});
  const ro=await rr.json().catch(()=>({}));
  if(!rr.ok||!ro?.id)return json({ok:false,error:"RAZORPAY_ORDER_CREATE_FAILED"},502);
  const {data:p,error:pe}=await admin.from("payments").insert({order_id:oid,gateway:"razorpay",gateway_order_id:ro.id,amount,currency,status:"created"}).select("id").single();
  if(pe||!p)return json({ok:false,error:"PAYMENT_RECORD_FAILED"},500);
  return json({ok:true,key_id:kid,razorpay_order_id:ro.id,payment_id:p.id,amount,currency});
 }
 if(body?.action==="verify"){
  const oid=String(body.order_id||"").trim(),pid=String(body.razorpay_payment_id||"").trim(),sig=String(body.razorpay_signature||"").trim();
  if(!oid||!pid||!sig)return json({ok:false,error:"PAYMENT_FIELDS_REQUIRED"},400);
  const {data:o,error:oe}=await admin.from("orders").select("id,order_number,total,currency,status,user_id,service_request_id").eq("id",oid).eq("user_id",user.id).maybeSingle();
  if(oe)return json({ok:false,error:"ORDER_LOOKUP_FAILED"},500);
  if(!o)return json({ok:false,error:"ORDER_NOT_FOUND"},404);
  const {data:p,error:pe}=await admin.from("payments").select("id,gateway_order_id,gateway_payment_id,status").eq("order_id",oid).eq("gateway","razorpay").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(pe)return json({ok:false,error:"PAYMENT_LOOKUP_FAILED"},500);
  if(!p?.gateway_order_id)return json({ok:false,error:"PAYMENT_RECORD_NOT_FOUND"},404);
  if(p.status!=="paid"){
   const expected=await hmac(secret,p.gateway_order_id+"|"+pid);
   if(!safeEqual(expected,sig))return json({ok:false,error:"SIGNATURE_VERIFICATION_FAILED"},400);
   const gr=await fetch("https://api.razorpay.com/v1/payments/"+encodeURIComponent(pid),{headers:{Authorization:"Basic "+btoa(kid+":"+secret)}});
   const gp=await gr.json().catch(()=>({}));
   if(!gr.ok||gp?.order_id!==p.gateway_order_id||Number(gp?.amount)!==Math.round(Number(o.total)*100)||String(gp?.currency||"").toUpperCase()!==String(o.currency||"").toUpperCase()||gp?.status!=="captured")return json({ok:false,error:"GATEWAY_PAYMENT_NOT_CONFIRMED"},409);
   if(p.gateway_payment_id&&p.gateway_payment_id!==pid)return json({ok:false,error:"PAYMENT_ID_MISMATCH"},409);
   const {error}=await admin.from("payments").update({gateway_payment_id:pid,status:"paid",paid_at:new Date().toISOString()}).eq("id",p.id);
   if(error)return json({ok:false,error:"PAYMENT_UPDATE_FAILED"},500);
  }else if(p.gateway_payment_id&&p.gateway_payment_id!==pid)return json({ok:false,error:"PAYMENT_ID_MISMATCH"},409);
  const {error:oe2}=await admin.from("orders").update({status:"paid"}).eq("id",oid);
  if(oe2)return json({ok:false,error:"ORDER_UPDATE_FAILED"},500);
  if(o.service_request_id){
   const {data:sr,error:se}=await admin.from("service_requests").select("id,service_id").eq("id",o.service_request_id).eq("user_id",user.id).maybeSingle();
   if(se)return json({ok:false,error:"SERVICE_REQUEST_LOOKUP_FAILED"},500);
   if(!sr?.service_id)return json({ok:false,error:"SERVICE_REQUEST_NOT_FOUND"},409);
   const {error:sue}=await admin.from("service_requests").update({status:"paid"}).eq("id",sr.id);
   if(sue)return json({ok:false,error:"SERVICE_REQUEST_UPDATE_FAILED"},500);
   const {error:ee}=await admin.from("entitlements").upsert({user_id:user.id,service_id:sr.service_id,order_id:oid,status:"active"},{onConflict:"user_id,service_id,order_id"});
   if(ee)return json({ok:false,error:"ENTITLEMENT_GRANT_FAILED"},500);
  }
  return json({ok:true,status:"paid",order_number:o.order_number});
 }
 return json({ok:false,error:"UNKNOWN_ACTION"},400);
});
