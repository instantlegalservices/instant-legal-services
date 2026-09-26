import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"}});
const OFFICIAL_DOMAINS=["sci.gov.in","supremecourt.gov.in","indiacode.nic.in","legislative.gov.in","doj.gov.in","ecourts.gov.in","allahabadhighcourt.in","hcservices.ecourts.gov.in","main.sci.gov.in","gazette.nic.in"];
function isOfficial(url:string){try{const h=new URL(url).hostname.toLowerCase();return OFFICIAL_DOMAINS.some(d=>h===d||h.endsWith("."+d));}catch{return false;}}
function extractUrls(v:any){const out:string[]=[];const walk=(x:any)=>{if(!x)return;if(typeof x==="string"){for(const m of x.matchAll(/https?:\/\/[^\s)\]>"']+/g))out.push(m[0].replace(/[.,;]+$/,""));return;}if(Array.isArray(x))x.forEach(walk);else if(typeof x==="object")Object.values(x).forEach(walk)};walk(v);return [...new Set(out)];}
function extractSources(resp:any){
  const out:any[]=[];
  const anns=resp?.choices?.[0]?.message?.annotations;
  if(Array.isArray(anns)) for(const a of anns){
    const u=a?.url_citation?.url; const t=a?.url_citation?.title;
    if(u && isOfficial(u)) out.push({url:u,title:t||new URL(u).hostname});
  }
  for(const url of extractUrls(resp)) if(isOfficial(url)) out.push({url,title:new URL(url).hostname});
  const seen=new Set<string>(); return out.filter(x=>{if(seen.has(x.url))return false;seen.add(x.url);return true});
}

Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return json({ok:true});
 try{
  const body=await req.json();
  const question=String(body?.question||"").trim();
  const mode="public";
  if(!question)return json({ok:false,message:"Question is required."},400);
  if(question.length>6000)return json({ok:false,message:"Question is too long."},400);
  const openKey=Deno.env.get("OPENROUTER_API_KEY");
  if(!openKey)return json({ok:false,message:"AI service is not configured. Add OPENROUTER_API_KEY in Supabase secrets."},503);

  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||Deno.env.get("SUPABASE_SECRET_KEY")||"";
  if(mode==="advocate"){
    const auth=req.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer "))return json({ok:false,message:"Advocate Research AI requires login."},401);
    if(!serviceKey)return json({ok:false,message:"Secure advocate verification is not configured."},503);
    const userClient=createClient(supabaseUrl,serviceKey);
    const token=auth.slice(7);
    const {data:userData,error:userError}=await userClient.auth.getUser(token);
    if(userError||!userData.user)return json({ok:false,message:"Your login session is invalid or expired."},401);
    const email=String(userData.user.email||"").toLowerCase();
    const {data:adv,error:advError}=await userClient.from("advocate_registrations").select("id,advocate_name,status,verification_status").eq("email",email).maybeSingle();
    if(advError||!adv)return json({ok:false,message:"This account is not registered as an ILS advocate."},403);
    if(String(adv.status).toLowerCase()!=="approved"||String(adv.verification_status).toLowerCase()!=="approved")return json({ok:false,message:"Advocate Research AI is available only to approved and verified ILS advocates."},403);
  }

  const system=`You are Instant Legal Services (ILS) Public Legal AI for Indian law. Produce professional, natural, precise work product, but never claim to be a human, lawyer, advocate, or eyewitness. The objective is human-quality usefulness, not imitation or concealment of AI authorship.\n\nEVIDENCE-FIRST RULES:\n1. Treat user-supplied facts, documents and evidence as the factual record; never add facts that are not supplied or verified.\n2. For current or legally material propositions, use authoritative-source search before stating them as fact.\n3. Prefer Indian primary/official sources: Supreme Court, relevant High Courts, India Code, Legislative Department/Gazette, Department of Justice, official eCourts and official tax/GST/MCA authorities where applicable.\n4. Never invent or guess a section, case name, citation, date, quotation, ratio, limitation period, procedural rule, evidence or factual circumstance.\n5. Separate FACTS, EVIDENCE, LAW, INFERENCE and UNCERTAINTY. Never present an inference as an established fact.\n6. Cross-check material legal propositions against the retrieved source before including them. If sources conflict, explicitly identify the conflict instead of choosing silently.\n7. If a material proposition cannot be verified, state: 'No verified answer is available from the authoritative sources searched.' Do not fill the gap from model memory.\n8. For drafting, preserve supplied facts exactly; do not fabricate names, dates, amounts, events, admissions, exhibits or citations. Use [VERIFY] markers where a required fact is missing.\n9. For evidence analysis, explain what the supplied evidence supports, what it does not establish, and what additional evidence would be needed.\n10. Do not guarantee a legal outcome or create an advocate-client relationship.\n11. Cite authoritative sources using the exact URLs returned by search.\n12. If authoritative verification is unavailable for a material legal conclusion, abstain from that conclusion.\n\nWrite naturally and professionally, with clear Indian legal drafting style. Do not use generic AI filler, exaggerated certainty, invented confidence, or unnecessary disclaimers. Answer structure: Issue; Facts/Evidence; Applicable law; Verified analysis; Draft/Action; Gaps to verify; Sources.`;
  const user=`Indian-law question:\n${question}\n\n${String(body?.context||"").slice(0,8000)}`;
  const model=Deno.env.get("ILS_AI_MODEL")||"openai/gpt-4.1";
  const payload={model,messages:[{role:"system",content:system},{role:"user",content:user}],temperature:0.05,max_tokens:2200,tools:[{type:"openrouter:web_search",parameters:{max_results:8,allowed_domains:OFFICIAL_DOMAINS}}]};
  const r=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"Authorization":`Bearer ${openKey}`,"Content-Type":"application/json","HTTP-Referer":"https://instantlegalservices.in","X-Title":"Instant Legal Services"},body:JSON.stringify(payload)});
  const raw=await r.text();let resp:any;try{resp=JSON.parse(raw)}catch{return json({ok:false,message:"AI provider returned an invalid response."},502)}
  if(!r.ok)return json({ok:false,message:resp?.error?.message||"OpenRouter request failed."},502);
  const answer=String(resp?.choices?.[0]?.message?.content||"").trim();
  const sources=extractSources(resp);
  if(!answer)return json({ok:false,message:"No verified answer was returned."},502);
  if(sources.length===0)return json({ok:false,message:"No verified answer is available from the authoritative sources searched."},200);
  return json({ok:true,verified:true,mode,answer,sources,model});
 }catch(e){console.error(e);return json({ok:false,message:e?.message||"AI service error."},500)}
});