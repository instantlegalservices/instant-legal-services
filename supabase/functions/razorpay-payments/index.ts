import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const env=(k:string)=>Deno.env.get(k)||"";
const url=env("SUPABASE_URL"),anonKey=env("SUPABASE_ANON_KEY"),serviceRoleKey=env("SUPABASE_SERVICE_ROLE_KEY"),kid=env("RAZORPAY_KEY_ID"),secret=env("RAZORPAY_KEY_SECRET");
async function hmac(s:string,m:string){const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(s),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const b=await crypto.subtle.sign("HMAC",k,new TextEncoder().encode(m));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("");}
function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
async function reconcileRazorpayOrder(paymentAttemptId:string,orderId:string,amount:number,currency:string,createdAt:number){
 const receipt="ILS"+String(paymentAttemptId).replaceAll("-","");
 const from=Math.max(0,Math.floor(createdAt)-60);
 const to=Math.floor(Date.now()/1000)+60;
 const matches:any[]=[];
 let complete=false;
 for(let skip=0;skip<1000;skip+=100){
  const query=new URLSearchParams({from:String(from),to:String(to),count:"100",skip:String(skip)});
  let response:Response;
  try{response=await fetch("https://api.razorpay.com/v1/orders?"+query.toString(),{headers:{Authorization:"Basic "+btoa(kid+":"+secret)},signal:AbortSignal.timeout(10000)});}
  catch{return {ok:false,reason:"ORDER_LOOKUP_UNAVAILABLE"};}
  const page=await response.json().catch(()=>null);
  if(!response.ok||!Array.isArray(page?.items))return {ok:false,reason:"ORDER_LOOKUP_UNAVAILABLE"};
  for(const candidate of page.items){
   if(candidate?.receipt===receipt && String(candidate?.notes?.payment_attempt_id||"")===String(paymentAttemptId) && String(candidate?.notes?.ils_order_id||"")===String(orderId) && Number(candidate?.amount)===Math.round(amount*100) && String(candidate?.currency||"").toUpperCase()===currency)matches.push(candidate);
  }
  if(page.items.length<100){complete=true;break;}
 }
 if(!complete)return {ok:false,reason:"ORDER_LOOKUP_WINDOW_INCOMPLETE"};
 if(matches.length!==1)return {ok:false,reason:matches.length>1?"MULTIPLE_MATCHING_GATEWAY_ORDERS":"NO_MATCHING_GATEWAY_ORDER"};
 return {ok:true,order:matches[0]};
}
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
  const {data:reservation,error:reservationError}=await admin.rpc("ils_reserve_razorpay_attempt",{p_order_id:oid});
  if(reservationError||!reservation?.ok)return json({ok:false,error:reservationError?.message||"PAYMENT_RESERVATION_FAILED"},409);
  const amount=Number(reservation.amount),currency=String(reservation.currency||"").toUpperCase();
  if(!Number.isFinite(amount)||amount<=0||!/^[A-Z]{3}$/.test(currency))return json({ok:false,error:"INVALID_ORDER_AMOUNT"},422);
  if(reservation.gateway_order_id)return json({ok:true,key_id:kid,razorpay_order_id:reservation.gateway_order_id,payment_id:reservation.payment_id,amount,currency});

  let rr:Response;
  let ro:any;
  try{
   rr=await fetch("https://api.razorpay.com/v1/orders",{method:"POST",headers:{Authorization:"Basic "+btoa(kid+":"+secret),"Content-Type":"application/json"},body:JSON.stringify({amount:Math.round(amount*100),currency,receipt:"ILS"+String(reservation.payment_id).replaceAll("-",""),notes:{ils_order_id:oid,user_id:user.id,payment_attempt_id:reservation.payment_id},payment_capture:1}),signal:AbortSignal.timeout(15000)});
   ro=await rr.json().catch(()=>({}));
  }catch{
   // Gateway may have created the order despite this network timeout. Keep the reservation pending so UPI fallback and duplicate creates remain blocked until reconciliation.
   return json({ok:false,error:"RAZORPAY_ORDER_CREATE_OUTCOME_UNKNOWN"},504);
  }
  if(!rr.ok||!ro?.id){
   // Duplicate receipt may mean the original order already exists. Reconcile exact identifiers before proceeding.
   const reconciled=await reconcileRazorpayOrder(String(reservation.payment_id),oid,amount,currency,Number(reservation.created_at));
   if(!reconciled.ok)return json({ok:false,error:"RAZORPAY_ORDER_RECONCILIATION_REQUIRED",reason:reconciled.reason},409);
   ro=reconciled.order;
  }
  const {data:attached,error:attachError}=await admin.rpc("ils_attach_razorpay_order",{
   p_payment_id:reservation.payment_id,p_gateway_order_id:String(ro.id)
  });
  if(attachError||!attached?.ok){
   // External order exists; keep the reservation pending and block another gateway attempt until reconciliation.
   return json({ok:false,error:"RAZORPAY_ORDER_ATTACH_RECONCILIATION_REQUIRED"},500);
  }
  return json({ok:true,key_id:kid,razorpay_order_id:ro.id,payment_id:reservation.payment_id,amount,currency});
 }
 if(body?.action==="verify"){
  const oid=String(body.order_id||"").trim(),pid=String(body.razorpay_payment_id||"").trim(),sig=String(body.razorpay_signature||"").trim();
  if(!oid||!pid||!sig)return json({ok:false,error:"PAYMENT_FIELDS_REQUIRED"},400);
  const {data:o,error:oe}=await admin.from("orders").select("id,order_number,total,currency,status,user_id,service_request_id").eq("id",oid).eq("user_id",user.id).maybeSingle();
  if(oe)return json({ok:false,error:"ORDER_LOOKUP_FAILED"},500);
  if(!o)return json({ok:false,error:"ORDER_NOT_FOUND"},404);
  const {data:p,error:pe}=await admin.from("payments").select("id,gateway_order_id,gateway_payment_id,status,amount,currency").eq("order_id",oid).eq("gateway","razorpay").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(pe)return json({ok:false,error:"PAYMENT_LOOKUP_FAILED"},500);
  if(!p?.gateway_order_id)return json({ok:false,error:"PAYMENT_RECORD_NOT_FOUND"},404);
  if(Number(p.amount)!==Number(o.total)||String(p.currency||"").toUpperCase()!==String(o.currency||"").toUpperCase())return json({ok:false,error:"PAYMENT_ORDER_AMOUNT_CURRENCY_MISMATCH"},409);
  let paidGatewayAmount=0;
  let paidGatewayCurrency="";
  if(p.status!=="paid"||!p.gateway_payment_id){
   const expected=await hmac(secret,p.gateway_order_id+"|"+pid);
   if(!safeEqual(expected,sig))return json({ok:false,error:"SIGNATURE_VERIFICATION_FAILED"},400);
   const gr=await fetch("https://api.razorpay.com/v1/payments/"+encodeURIComponent(pid),{headers:{Authorization:"Basic "+btoa(kid+":"+secret)}});
   const gp=await gr.json().catch(()=>({}));
   if(!gr.ok||gp?.order_id!==p.gateway_order_id||Number(gp?.amount)!==Math.round(Number(o.total)*100)||String(gp?.currency||"").toUpperCase()!==String(o.currency||"").toUpperCase()||gp?.status!=="captured")return json({ok:false,error:"GATEWAY_PAYMENT_NOT_CONFIRMED"},409);
   if(p.gateway_payment_id&&p.gateway_payment_id!==pid)return json({ok:false,error:"PAYMENT_ID_MISMATCH"},409);
   paidGatewayAmount=Number(gp.amount);
   paidGatewayCurrency=String(gp.currency);
  }else if(p.gateway_payment_id&&p.gateway_payment_id!==pid)return json({ok:false,error:"PAYMENT_ID_MISMATCH"},409);
  if(p.status==="paid"){
   paidGatewayAmount=Math.round(Number(p.amount)*100);
   paidGatewayCurrency=String(p.currency);
  }
  if(!paidGatewayAmount||!paidGatewayCurrency)return json({ok:false,error:"GATEWAY_SETTLEMENT_DETAILS_MISSING"},409);
  // One database transaction settles payment, order, request and entitlement.
  const {data:finalized,error:finalizeError}=await admin.rpc("ils_finalize_razorpay_payment",{
   p_payment_id:p.id,p_gateway_payment_id:pid,
   p_gateway_amount_minor:Number(paidGatewayAmount),
   p_gateway_currency:String(paidGatewayCurrency||"")
  });
  if(finalizeError||!finalized?.ok)return json({ok:false,error:"PAYMENT_FINALIZATION_FAILED"},409);
  return json({ok:true,status:"paid",order_number:o.order_number});
 }
 return json({ok:false,error:"UNKNOWN_ACTION"},400);
});
