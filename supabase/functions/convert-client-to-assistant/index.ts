import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};

const json=(body,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{...corsHeaders,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
});
const clean=(v)=>String(v??"").trim();

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{status:200,headers:corsHeaders});
  if(req.method!=="POST") return json({ok:false,message:"Only POST requests are allowed.",code:"METHOD_NOT_ALLOWED"},405);

  try{
    const auth=req.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer ")) return json({ok:false,message:"Client login required.",code:"AUTH_REQUIRED"},401);

    const token=auth.slice(7).trim();
    const url=Deno.env.get("SUPABASE_URL");
    const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!url||!serviceRole) return json({ok:false,message:"Assistant onboarding service is temporarily unavailable.",code:"SERVICE_CONFIG_ERROR"},503);

    const admin=createClient(url,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:userData,error:userError}=await admin.auth.getUser(token);
    if(userError||!userData.user) return json({ok:false,message:"Your client login session is invalid or expired.",code:"INVALID_SESSION"},401);

    const user=userData.user;
    const uid=user.id;
    const email=clean(user.email).toLowerCase();
    const b=await req.json();

    const fullName=clean(b.full_name);
    const mobile=clean(b.mobile);
    const address=clean(b.address);
    const extraSkills=clean(b.extra_skills);
    const signedName=clean(b.undertaking_signed_name);

    if(!fullName||!email||!mobile||!address||!extraSkills||!signedName)
      return json({ok:false,message:"Name, email, mobile, address, skills and undertaking signature are required.",code:"VALIDATION_ERROR"},400);
    if(!/^\d{10}$/.test(mobile))
      return json({ok:false,message:"Enter a valid 10 digit mobile number.",code:"INVALID_MOBILE"},400);
    if(b.undertaking_accepted!==true)
      return json({ok:false,message:"Please accept the ILS undertaking.",code:"UNDERTAKING_REQUIRED"},400);
    if(signedName.toLowerCase()!==fullName.toLowerCase())
      return json({ok:false,message:"Undertaking signature must match the full name.",code:"SIGNATURE_MISMATCH"},400);

    const {data:customer,error:customerError}=await admin
      .from("customer_profiles")
      .select("id,status,full_name,mobile")
      .eq("user_id",uid)
      .maybeSingle();

    if(customerError) return json({ok:false,message:"Unable to verify your ILS client profile.",code:"CUSTOMER_LOOKUP_ERROR"},500);
    if(!customer||customer.status!=="active") return json({ok:false,message:"Active ILS client profile is required.",code:"CUSTOMER_REQUIRED"},403);

    const {data:existing,error:existingError}=await admin
      .from("professional_join_requests")
      .select("id,status,verification_status")
      .eq("auth_user_id",uid)
      .eq("professional_type","assistant_associate")
      .order("created_at",{ascending:false})
      .limit(1);

    if(existingError) return json({ok:false,message:"Unable to check your assistant application.",code:"LOOKUP_ERROR"},500);
    if(existing?.[0]) return json({
      ok:true,
      already_exists:true,
      request_id:existing[0].id,
      status:existing[0].status,
      verification_status:existing[0].verification_status,
      message:"Your Assistant / Associate application already exists. You can continue using the same ILS login."
    });

    const {data:inserted,error:insertError}=await admin
      .from("professional_join_requests")
      .insert([{
        professional_type:"assistant_associate",
        full_name:fullName,
        email,
        mobile,
        membership_number:null,
        certificate_of_practice:null,
        state:null,
        city:null,
        address,
        specialization:null,
        years_of_experience:null,
        firm_or_organization:null,
        photo_storage_path:null,
        extra_skills:extraSkills,
        undertaking_accepted:true,
        undertaking_signed_name:signedName,
        undertaking_signed_at:new Date().toISOString(),
        verification_status:"Pending",
        status:"Pending",
        public_profile:false,
        admin_notes:"Converted from authenticated ILS customer account after official-form submission checkpoint. Same auth_user_id retained.",
        auth_user_id:uid
      }])
      .select("id")
      .single();

    if(insertError||!inserted?.id)
      return json({ok:false,message:"Unable to create the Assistant / Associate application.",code:"INSERT_ERROR"},500);

    return json({
      ok:true,
      request_id:inserted.id,
      same_login:true,
      professional_type:"assistant_associate",
      message:"Assistant / Associate application submitted using the existing ILS client login. ILS review is required before professional-network access is enabled."
    });
  }catch(error){
    console.error("convert-client-to-assistant:",error);
    return json({ok:false,message:"Assistant application could not be completed right now.",code:"SERVICE_ERROR"},500);
  }
});