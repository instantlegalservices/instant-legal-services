import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};

const ALLOWED=new Set(["ca","cs","hr","gst_practitioner","assistant_associate"]);

function json(body,status=200){
  return new Response(JSON.stringify(body),{
    status,
    headers:{...corsHeaders,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
  });
}

function clean(v){return String(v??"").trim();}
function selectedServiceCount(v){return clean(v).split("|").map(x=>x.trim()).filter(Boolean).length;}

async function hmacAadhaar(aadhaar, secret){
  const key=await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {name:"HMAC",hash:"SHA-256"},
    false,
    ["sign"]
  );
  const sig=await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(aadhaar)
  );
  return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{status:200,headers:corsHeaders});
  if(req.method!=="POST") return json({ok:false,message:"Only POST requests are allowed.",code:"METHOD_NOT_ALLOWED"},405);

  let admin=null;
  let createdUserId=null;

  try{
    const b=await req.json();

    const professionalType=clean(b.professional_type).toLowerCase();
    const fullName=clean(b.full_name);
    const email=clean(b.email).toLowerCase();
    const mobile=clean(b.mobile);
    const membershipNumber=clean(b.membership_number);
    const cop=clean(b.certificate_of_practice);
    const state=clean(b.state);
    const city=clean(b.city);
    const address=clean(b.address);
    const specialization=clean(b.specialization);
    const firm=clean(b.firm_or_organization);
    const extraSkills=clean(b.extra_skills);
    const photoStoragePath=clean(b.photo_storage_path);
    const undertakingSignedName=clean(b.undertaking_signed_name);
    const password=String(b.password??"");
    const aadhaar=clean(b.aadhaar_number).replace(/\s|-/g,"");
    const years=b.years_of_experience===""||b.years_of_experience==null?null:Number(b.years_of_experience);

    if(!ALLOWED.has(professionalType))
      return json({ok:false,message:"Select a supported professional category.",code:"INVALID_TYPE"},400);

    if(!fullName||!email||!mobile||!address||!password||!undertakingSignedName)
      return json({ok:false,message:"Name, email, mobile, address, password and undertaking signature are required.",code:"VALIDATION_ERROR"},400);

    if(!/^\S+@\S+\.\S+$/.test(email))
      return json({ok:false,message:"Enter a valid email address.",code:"INVALID_EMAIL"},400);

    if(!/^[0-9]{10}$/.test(mobile))
      return json({ok:false,message:"Enter a valid 10 digit mobile number.",code:"INVALID_MOBILE"},400);

    if(password.length<8)
      return json({ok:false,message:"Password must contain at least 8 characters.",code:"INVALID_PASSWORD"},400);

    if(undertakingSignedName.toLowerCase()!==fullName.toLowerCase())
      return json({ok:false,message:"Undertaking signature must match the full name.",code:"SIGNATURE_MISMATCH"},400);

    if(b.undertaking_accepted!==true)
      return json({ok:false,message:"Please accept the ILS undertaking before submitting.",code:"UNDERTAKING_REQUIRED"},400);

    if(years!==null&&(!Number.isInteger(years)||years<0||years>80))
      return json({ok:false,message:"Enter valid years of experience.",code:"INVALID_EXPERIENCE"},400);

    if(["ca","cs"].includes(professionalType)){
      if(!membershipNumber) return json({ok:false,message:"Membership number is required for CA/CS verification.",code:"MEMBERSHIP_REQUIRED"},400);
      if(!cop) return json({ok:false,message:"Please select the Certificate of Practice status for CA/CS.",code:"COP_REQUIRED"},400);
      if(!state||!city) return json({ok:false,message:"State and city are required for CA/CS review.",code:"LOCATION_REQUIRED"},400);
      if(selectedServiceCount(specialization)<3) return json({ok:false,message:"Please select at least 3 professional service / specialization options.",code:"SPECIALIZATION_MINIMUM"},400);
    }

    if(professionalType==="hr" && selectedServiceCount(specialization)<3)
      return json({ok:false,message:"Please select at least 3 HR service / specialization options.",code:"SPECIALIZATION_MINIMUM"},400);

    if(professionalType==="gst_practitioner"){
      if(!membershipNumber) return json({ok:false,message:"GST Practitioner enrolment / registration number is required.",code:"GSTP_NUMBER_REQUIRED"},400);
      if(!state||!city) return json({ok:false,message:"State and city are required for GST Practitioner review.",code:"LOCATION_REQUIRED"},400);
      if(selectedServiceCount(specialization)<3) return json({ok:false,message:"Please select at least 3 GST service / service-area options.",code:"SPECIALIZATION_MINIMUM"},400);
    }

    let aadhaarHash=null;
    let aadhaarLast4=null;
    if(professionalType==="assistant_associate"){
      if(!/^[0-9]{12}$/.test(aadhaar))
        return json({ok:false,message:"Enter a valid 12 digit Aadhaar number.",code:"INVALID_AADHAAR"},400);
      const secret=Deno.env.get("AADHAAR_HMAC_SECRET")||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if(!secret)
        return json({ok:false,message:"Secure identity service is temporarily unavailable.",code:"IDENTITY_CONFIG_ERROR"},503);
      aadhaarHash=await hmacAadhaar(aadhaar,secret);
      aadhaarLast4=aadhaar.slice(-4);
    }

    const url=Deno.env.get("SUPABASE_URL");
    const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!url||!serviceRole)
      return json({ok:false,message:"Registration service is temporarily unavailable.",code:"SERVICE_CONFIG_ERROR"},503);

    admin=createClient(url,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});

    const {data:existing,error:lookupError}=await admin
      .from("professional_join_requests")
      .select("id,status")
      .ilike("email",email)
      .eq("professional_type",professionalType)
      .limit(1);

    if(lookupError)
      return json({ok:false,message:"Unable to check this registration right now.",code:"LOOKUP_ERROR"},500);

    if((existing??[]).length)
      return json({ok:false,message:"A registration for this professional category already exists with this email.",code:"DUPLICATE"},409);

    const {data:created,error:authError}=await admin.auth.admin.createUser({
      email,
      password,
      email_confirm:true,
      app_metadata:{
        profession:professionalType,
        ils_network_member:true,
        registration_pending:true
      },
      user_metadata:{
        role:professionalType,
        professional_type:professionalType,
        full_name:fullName,
        registration_pending:true
      }
    });

    if(authError||!created?.user){
      console.error("register-professional auth create",authError);
      return json({
        ok:false,
        message:authError?.message||"Unable to create secure login account. Please use another email or try again.",
        code:"AUTH_CREATE_ERROR"
      },409);
    }

    createdUserId=created.user.id;

    const {data:inserted,error:insertError}=await admin
      .from("professional_join_requests")
      .insert([{
        professional_type:professionalType,
        full_name:fullName,
        email,
        mobile,
        membership_number:membershipNumber||null,
        certificate_of_practice:cop||null,
        state:state||null,
        city:city||null,
        address:address||null,
        specialization:specialization||null,
        years_of_experience:years,
        firm_or_organization:firm||null,
        photo_storage_path:photoStoragePath||null,
        extra_skills:extraSkills||null,
        aadhaar_hash:aadhaarHash,
        aadhaar_last4:aadhaarLast4,
        undertaking_accepted:true,
        undertaking_signed_name:undertakingSignedName,
        undertaking_signed_at:new Date().toISOString(),
        verification_status:"Pending",
        status:"Pending",
        public_profile:false,
        admin_notes:"ILS professional ethics undertaking accepted at registration.",
        auth_user_id:createdUserId
      }])
      .select("id")
      .single();

    if(insertError||!inserted?.id){
      console.error("register-professional insert",insertError);
      if(createdUserId){
        await admin.auth.admin.deleteUser(createdUserId).catch(cleanup=>console.error("register-professional auth cleanup",cleanup));
        createdUserId=null;
      }
      return json({ok:false,message:"Unable to save this registration right now. Please try again.",code:"INSERT_ERROR"},500);
    }

    return json({
      ok:true,
      request_id:inserted.id,
      auth_user_id:createdUserId,
      login_created:true,
      public_listing:false,
      message:["ca","cs"].includes(professionalType)
        ?"Registration and login account created. Your CA/CS profile remains hidden until credentials are verified and the profile is approved for public listing."
        :"Registration and login account created. This category remains internal and will not appear on the public homepage."
    });
  }catch(error){
    console.error("register-professional unexpected",error);
    if(admin&&createdUserId){
      await admin.auth.admin.deleteUser(createdUserId).catch(cleanup=>console.error("register-professional unexpected cleanup",cleanup));
    }
    return json({ok:false,message:"Registration could not be completed right now. Please try again.",code:"SERVICE_ERROR"},500);
  }
});