import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const TEST_REF="bgsbuepolooybdqrzmoa", PROD_REF="odqebkdzkjfxzyzbrndt", SYNTHETIC_CODE="TEST_PROFESSIONAL_A";
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"}});
const deny=(e:string,s=403)=>json({ok:false,gate:"HOLD",error:e,production_touch_detected:false},s);
const ref=(u:string)=>{try{return new URL(u).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1]??""}catch{return""}};
Deno.serve(async(req)=>{
 if(req.method!=="POST")return deny("METHOD_NOT_ALLOWED",405);
 const url=Deno.env.get("SUPABASE_URL")||"", service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(ref(url)!==TEST_REF)return deny("TEST_PROJECT_REQUIRED",500);
 if(ref(url)===PROD_REF||url.includes(PROD_REF))return deny("PRODUCTION_ACCESS_FORBIDDEN",403);
 if(!service)return deny("SERVER_CONFIG_ERROR",500);
 const h=req.headers.get("authorization")||""; if(!h.toLowerCase().startsWith("bearer "))return deny("AUTH_REQUIRED",401);
 const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
 const {data:u,error:ue}=await admin.auth.getUser(h.slice(7).trim()); if(ue||!u.user)return deny("AUTH_REQUIRED",401);
 const {data:op,error:oe}=await admin.rpc("ils_test_get_provision_operator",{p_operator_user_id:u.user.id});
 const operator=Array.isArray(op)?op[0]:op; if(oe||!operator?.active||operator.role!=="TEST_PROVISION_OPERATOR")return deny("TEST_PROVISION_OPERATOR_REQUIRED",403);
 let b:any={};try{b=await req.json()}catch{} const action=String(b.action||"").toUpperCase();

 if(action==="PREPARE"){
   const ex=await admin.from("ils_test_synthetic_professional_auth_provisioning").select("id,request_id,status,auth_user_id").eq("synthetic_code",SYNTHETIC_CODE).maybeSingle();
   if(ex.data)return json({ok:true,gate:"ALREADY_PREPARED",provisioning_id:ex.data.id,request_id:ex.data.request_id,status:ex.data.status,auth_user_id:ex.data.auth_user_id??null,production_touch_detected:false});
   const {data:r,error:re}=await admin.rpc("ils_prepare_synthetic_user_provision_request",{p_version:"8G-PROFESSIONAL-A"});
   if(re||!r)return deny("PROVISION_REQUEST_PREPARE_FAILED",503); const rr=Array.isArray(r)?r[0]:r;
   const nonce=crypto.randomUUID()+"-"+crypto.randomUUID();
   const {data:bb,error:be}=await admin.rpc("ils_bind_synthetic_provision_approval",{p_request_id:rr.request_id,p_nonce:nonce,p_ttl_minutes:15});
   if(be||!bb)return deny("APPROVAL_BIND_FAILED",503); const br=Array.isArray(bb)?bb[0]:bb;
   const {data:m,error:me}=await admin.from("ils_test_synthetic_professional_auth_provisioning").insert({synthetic_code:SYNTHETIC_CODE,request_id:rr.request_id,operator_user_id:u.user.id,status:"AWAITING_EXPLICIT_APPROVAL"}).select("id,request_id,status").single();
   if(me||!m)return deny("PROFESSIONAL_PROVISION_RECORD_FAILED",503);
   return json({ok:true,gate:"PREPARED",provisioning_id:m.id,request_id:rr.request_id,binding_id:br.binding_id,status:"AWAITING_EXPLICIT_APPROVAL",approval_material_required:true,production_touch_detected:false});
 }

 if(action==="APPROVE"){
   const {data:m,error:me}=await admin.from("ils_test_synthetic_professional_auth_provisioning").select("id,request_id,status").eq("synthetic_code",SYNTHETIC_CODE).maybeSingle();
   if(me||!m)return deny("PROFESSIONAL_PROVISION_NOT_PREPARED",404);
   const {data:a,error:ae}=await admin.rpc("ils_record_synthetic_operator_approval_v1",{p_request_id:m.request_id,p_binding_id:String(b.binding_id||""),p_approval_nonce:String(b.approval_nonce||""),p_request_snapshot_hash:String(b.request_snapshot_hash||"")});
   if(ae)return deny("OPERATOR_APPROVAL_FAILED",403);
   await admin.from("ils_test_synthetic_professional_auth_provisioning").update({status:"APPROVED",operator_user_id:u.user.id,updated_at:new Date().toISOString()}).eq("id",m.id);
   return json({ok:true,gate:"APPROVED",provisioning_id:m.id,request_id:m.request_id,status:"APPROVED",production_touch_detected:false,approval:a});
 }

 if(action==="PROVISION"){
   const {data:m,error:me}=await admin.from("ils_test_synthetic_professional_auth_provisioning").select("*").eq("synthetic_code",SYNTHETIC_CODE).maybeSingle();
   if(me||!m)return deny("PROFESSIONAL_PROVISION_NOT_PREPARED",404);
   if(m.auth_user_id)return json({ok:true,gate:"ALREADY_PROVISIONED",provisioning_id:m.id,auth_user_id:m.auth_user_id,status:m.status,production_touch_detected:false});
   if(m.status!=="APPROVED")return deny("PROVISION_NOT_APPROVED",403);
   const bindingId=String(b.binding_id||""); if(!bindingId)return deny("BINDING_ID_REQUIRED",400);
   const {data:c,error:ce}=await admin.rpc("ils_claim_synthetic_provision_v2",{p_request_id:m.request_id,p_binding_id:bindingId,p_operator_user_id:u.user.id});
   const cr=Array.isArray(c)?c[0]:c; if(ce||!cr||!["CLAIMED","ALREADY_CLAIMED"].includes(cr.decision)||!cr.claim_token)return deny("CLAIM_NOT_ACQUIRED",409);
   const {data:r,error:re}=await admin.from("ils_test_synthetic_user_provision_requests").select("requested_email,environment,synthetic_only,identity_created,password_exposed,production_accessed").eq("id",m.request_id).maybeSingle();
   if(re||!r||r.environment!=="TEST"||r.synthetic_only!==true||r.identity_created||r.password_exposed||r.production_accessed)return deny("UNSAFE_PROVISION_REQUEST",403);
   const email=String(r.requested_email).toLowerCase();
   const resolved=await admin.rpc("ils_resolve_synthetic_auth_identity_readonly_v1",{p_request_id:m.request_id,p_requested_email:email}); const rv=Array.isArray(resolved.data)?resolved.data[0]:resolved.data;
   if(resolved.error||!rv||rv.decision!=="NOT_FOUND")return deny("EXISTING_AUTH_IDENTITY_BLOCKED",409);
   const created=await admin.auth.admin.createUser({email,password:crypto.randomUUID()+"!A9",email_confirm:true,user_metadata:{ils_test_synthetic:true,ils_test_actor:"PROFESSIONAL",ils_test_actor_code:SYNTHETIC_CODE,provision_request_id:m.request_id}});
   if(created.error||!created.data.user)return deny("AUTH_IDENTITY_CREATION_FAILED",502);
   const id=created.data.user.id;
   const committed=await admin.rpc("ils_commit_synthetic_provision_v1",{p_request_id:m.request_id,p_binding_id:bindingId,p_claim_token:cr.claim_token,p_auth_user_id:id});
   if(committed.error)return json({ok:false,gate:"RECONCILIATION_REQUIRED",error:"COMMIT_FAILED_RECOVERY_PENDING",auth_user_created:true,auth_user_id:id,password_returned:false,production_accessed:false},{status:500});
   const {error:te}=await admin.from("ils_associate_trust_profiles").insert({user_id:id,associate_id:SYNTHETIC_CODE,role_type:"PROFESSIONAL_ASSOCIATE",display_name:"TEST Synthetic Professional A",profile_status:"ACTIVE",identity_verified:true,qualification_verified:true,professional_registration_verified:true,capability_verified:true,public_profile_enabled:false});
   if(te&&!/duplicate|unique/i.test(te.message||""))return deny("TRUST_PROFILE_CREATE_FAILED",503);
   const {error:ca}=await admin.from("ils_associate_capabilities").insert({user_id:id,role_type:"PROFESSIONAL_ASSOCIATE",capability_code:"TEST_AUTH_ONLY",capability_label:"TEST-only authentication eligibility",level:"VERIFIED",source:"TEST_SYNTHETIC",status:"VERIFIED",verified_at:new Date().toISOString()});
   if(ca&&!/duplicate|unique/i.test(ca.message||""))return deny("CAPABILITY_CREATE_FAILED",503);
   const {error:gp}=await admin.from("ils_associate_growth_profiles").insert({user_id:id,growth_level:"TRUSTED",growth_status:"ACTIVE"});
   if(gp&&!/duplicate|unique/i.test(gp.message||""))return deny("GROWTH_PROFILE_CREATE_FAILED",503);
   await admin.from("ils_test_synthetic_professional_auth_provisioning").update({auth_user_id:id,status:"AUTH_CREATED",trust_profile_created:true,capability_created:true,operator_user_id:u.user.id,updated_at:new Date().toISOString()}).eq("id",m.id);
   return json({ok:true,gate:"AUTH_CREATED",provisioning_id:m.id,auth_user_id:id,status:"AUTH_CREATED",provenance_class:"SYNTHETIC_TEST",password_returned:false,production_accessed:false,assignment_created:false,service_request_created:false,work_item_created:false});
 }
 return deny("UNKNOWN_ACTION",400);
});