import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"GET, POST, OPTIONS"
};

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{...corsHeaders,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
});

const clean=(v:unknown)=>String(v??"").trim();

function escapeLikePattern(value:string){
  return value.replace(/[\\%_]/g,"\\$&");
}

async function resolveIdentityBoundProfile(
  admin:any,
  table:"advocate_registrations"|"professional_join_requests",
  columns:string,
  userId:string,
  email:string
){
  if(!userId) return null;

  // A profile linked to this auth user always wins. Query errors and duplicate
  // linked identities fail closed instead of silently falling back to email.
  const {data:linked,error:linkedError}=await admin
    .from(table)
    .select(columns)
    .eq("auth_user_id",userId)
    .maybeSingle();
  if(linkedError) throw linkedError;
  if(linked) return linked;

  // Transitional compatibility is limited to profiles not linked to ANY auth user.
  // Escape LIKE metacharacters so the authenticated email is compared literally.
  if(!email) return null;
  const {data:legacy,error:legacyError}=await admin
    .from(table)
    .select(columns)
    .is("auth_user_id",null)
    .ilike("email",escapeLikePattern(email))
    .maybeSingle();
  if(legacyError) throw legacyError;
  return legacy||null;
}

async function resolveIdentityBoundProfile(
  admin:any,
  table:"advocate_registrations"|"professional_join_requests",
  columns:string,
  userId:string,
  email:string
){
  if(!userId) return null;

  // A profile linked to this auth user always wins. Query errors and duplicate
  // linked identities fail closed instead of silently falling back to email.
  const {data:linked,error:linkedError}=await admin
    .from(table)
    .select(columns)
    .eq("auth_user_id",userId)
    .maybeSingle();
  if(linkedError) throw linkedError;
  if(linked) return linked;

  // Transitional compatibility is limited to profiles not linked to ANY auth user.
  // Escape LIKE metacharacters so the authenticated email is compared literally.
  if(!email) return null;
  const {data:legacy,error:legacyError}=await admin
    .from(table)
    .select(columns)
    .is("auth_user_id",null)
    .ilike("email",escapeLikePattern(email))
    .maybeSingle();
  if(legacyError) throw legacyError;
  return legacy||null;
}

async function loadAdvocateAssignments(admin:any,advocateId:number,status:unknown,verificationStatus:unknown){
  const approved=String(status||"").trim().toLowerCase()==="approved"
    && String(verificationStatus||"").trim().toLowerCase()==="approved";
  if(!approved) return [];

  const {data:links,error:linksError}=await admin
    .from("advocate_assignments")
    .select("id,lead_id,status,assigned_at,client_can_see_contact")
    .eq("advocate_id",advocateId)
    .in("status",["Assigned","Active"])
    .order("assigned_at",{ascending:false});
  if(linksError) throw linksError;

  const assignments=Array.isArray(links)?links:[];
  const leadIds=[...new Set(assignments
    .map((item:any)=>Number(item.lead_id))
    .filter((id:number)=>Number.isSafeInteger(id)&&id>0))];
  if(!leadIds.length) return [];

  const {data:leads,error:leadsError}=await admin
    .from("client_requirements")
    .select("id,client_name,legal_matter,brief_requirement,state,district_city,status,priority,assigned_advocate_id,assigned_advocate,created_at")
    .in("id",leadIds);
  if(leadsError) throw leadsError;

  const leadById=new Map((Array.isArray(leads)?leads:[])
    .map((lead:any)=>[String(lead.id),lead]));
  return assignments.flatMap((assignment:any)=>{
    const leadId=Number(assignment.lead_id);
    if(!Number.isSafeInteger(leadId)||leadId<=0) return [];
    const lead=leadById.get(String(leadId));
    if(!lead) return [];
    return [{
      assignment_id:assignment.id,
      lead_id:leadId,
      assigned_at:assignment.assigned_at,
      status:assignment.status,
      client_can_see_contact:assignment.client_can_see_contact===true,
      client:lead
    }];
  });
};

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{status:200,headers:corsHeaders});
  if(req.method!=="GET" && req.method!=="POST") return json({ok:false,message:"Method not allowed."},405);

  try{
    const auth=req.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer ")) return json({ok:false,message:"Professional login required.",code:"AUTH_REQUIRED"},401);
    const token=auth.slice(7).trim();
    if(!token) return json({ok:false,message:"Professional login required.",code:"AUTH_REQUIRED"},401);

    const url=Deno.env.get("SUPABASE_URL");
    const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!url||!serviceRole) return json({ok:false,message:"Professional portal is temporarily unavailable.",code:"SERVICE_CONFIG_ERROR"},503);

    const admin=createClient(url,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:userData,error:userError}=await admin.auth.getUser(token);
    if(userError||!userData.user) return json({ok:false,message:"Your login session is invalid or expired.",code:"INVALID_SESSION"},401);

    const user=userData.user;
    const uid=user.id;
    const email=clean(user.email).toLowerCase();

    const adv=await resolveIdentityBoundProfile(
      admin,
      "advocate_registrations",
      "id,advocate_name,email,mobile,enrollment_number,state_bar_council,practice_state,district_court,primary_practice_area,years_of_practice,status,verification_status,public_profile,approved_at,undertaking_accepted",
      uid,
      email
    );

    if(adv){
      const a=adv;
      const assignments=await loadAdvocateAssignments(
        admin,a.id,a.status,a.verification_status
      );
      return json({
        ok:true,
        role:"advocate",
        assignments,
        profile:{
          id:a.id,
          name:a.advocate_name,
          email:a.email,
          mobile:a.mobile,
          enrollment_number:a.enrollment_number,
          state_bar_council:a.state_bar_council,
          state:a.practice_state,
          jurisdiction:a.district_court,
          specialization:a.primary_practice_area,
          experience:a.years_of_practice
        },
        status:String(a.status||"Pending"),
        verification_status:String(a.verification_status||"Pending"),
        public_profile:a.public_profile===true,
        approved_at:a.approved_at,
        undertaking_accepted:a.undertaking_accepted===true,
        capabilities:{
          professional_tools:true,
          research_ai:String(a.status||"").toLowerCase()==="approved" && String(a.verification_status||"").toLowerCase()==="approved"
        }
      });
    }

    const prof=await resolveIdentityBoundProfile(
      admin,
      "professional_join_requests",
      "id,professional_type,full_name,email,mobile,state,city,specialization,years_of_experience,firm_or_organization,status,verification_status,public_profile,created_at,undertaking_accepted",
      uid,
      email
    );

    if(prof){
      const p=prof;
      return json({
        ok:true,
        role:p.professional_type,
        profile:{
          id:p.id,
          name:p.full_name,
          email:p.email,
          mobile:p.mobile,
          state:p.state,
          city:p.city,
          specialization:p.specialization,
          experience:p.years_of_experience,
          firm_or_organization:p.firm_or_organization
        },
        status:String(p.status||"Pending"),
        verification_status:String(p.verification_status||"Pending"),
        public_profile:p.public_profile===true,
        approved_at:null,
        undertaking_accepted:p.undertaking_accepted===true,
        capabilities:{
          professional_tools:true,
          research_ai:false
        }
      });
    }

    return json({ok:false,message:"This login is not linked to an ILS professional registration.",code:"PROFILE_NOT_FOUND"},403);
  }catch(error){
    console.error("professional-portal:",error);
    return json({ok:false,message:"Unable to load your professional portal right now.",code:"PORTAL_ERROR"},500);
  }
});