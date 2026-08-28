
window.ILS = (() => {
  const SUPABASE_URL = "https://odqebkdzkjfxzyzbrndt.supabase.co";
  const SUPABASE_KEY = "sb_publishable_D5eFcgWFELtnym0K74inYg_BGn7rRUi";
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const split = v => String(v || "").split(/\s*\|\s*|\s*;\s*|\n/).map(x=>x.trim()).filter(Boolean);
  const formatDate = v => {
    if(!v) return "Date not available";
    const d = new Date(String(v).includes("T") ? v : v+"T00:00:00");
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});
  };
  let client = null;
  function ready(){ return client; }
  function goSearch(q){ const el=document.querySelector("#globalSearch"); if(el){el.value=q||"";el.focus();} }
  async function init(){
    if(window.supabase && !client) client = window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    document.querySelectorAll("[data-menu]").forEach(b=>b.addEventListener("click",()=>document.querySelector(".navlinks")?.classList.toggle("open")));
    document.querySelectorAll(".navlinks a").forEach(a=>a.addEventListener("click",()=>document.querySelector(".navlinks")?.classList.remove("open")));
    return client;
  }
  async function advocates({limit=12, featured=false, q="", state="", area=""}={}){
    if(!client) return [];
    let query = client.from("ils_public_advocate_directory").select("id,advocate_name,photo_url,profile_photo_url,enrollment_number,state_bar_council,practice_state,district_court,primary_practice_area,years_of_practice,verification_status,status,public_profile,created_at");
    if(q) query=query.or(`advocate_name.ilike.%${q}%,practice_state.ilike.%${q}%,district_court.ilike.%${q}%,primary_practice_area.ilike.%${q}%`);
    if(state) query=query.ilike("practice_state",`%${state}%`);
    if(area) query=query.ilike("primary_practice_area",`%${area}%`);
    const {data,error}=await query.order("created_at",{ascending:false}).limit(featured ? Math.max(8,limit*2) : limit);
    if(error){console.error(error);return []}
    let rows=data||[];
    if(featured && rows.length>limit) rows=rows.sort(()=>Math.random()-.5).slice(0,limit);
    return rows;
  }
  async function judgments({limit=20,q="",court="",category=""}={}){
    if(!client) return [];
    let query=client.from("judgments").select("id,case_title,case_number,court_type,court_name,judgment_date,primary_category,short_summary,detailed_summary,key_legal_issues,legal_principle,statutes_and_sections,important_precedents,final_decision,practical_significance,keywords,official_source_url,source_pdf_url,summary_status,is_latest,is_verified,created_at").eq("is_verified",true).eq("summary_status","completed").order("judgment_date",{ascending:false}).limit(limit);
    if(court) query=query.or(`court_name.ilike.%${court}%,court_type.ilike.%${court}%`);
    if(category) query=query.ilike("primary_category",`%${category}%`);
    if(q) query=query.or(`case_title.ilike.%${q}%,case_number.ilike.%${q}%,primary_category.ilike.%${q}%,keywords.ilike.%${q}%,short_summary.ilike.%${q}%,legal_principle.ilike.%${q}%`);
    const {data,error}=await query;
    if(error){console.error(error);return []}
    return data||[];
  }
  async function submitRequirement(payload){
    if(!client) throw new Error("Service connection unavailable.");
    const lead={client_name:payload.name.trim(),mobile:payload.mobile.trim(),state:payload.state,district_city:payload.city.trim(),legal_matter:payload.matter,brief_requirement:payload.brief.trim(),status:"New",payment_status:"Pending",priority:"Normal"};
    const {error}=await client.from("client_requirements").insert([lead]);
    if(error) throw error;
  }
  async function ai(question,context="",mode="public"){
    if(!client) return {ok:false,message:"AI connection unavailable."};
    try{
      const {data,error}=await client.functions.invoke("ils-ai-assistant",{body:{question,context,mode}});
      if(error || !data?.ok) return {ok:false,message:data?.message||error?.message||"AI service is not configured yet."};
      return data;
    }catch(e){return {ok:false,message:e.message||"AI service unavailable."}}
  }
  const SECTION_LINKS = [
    [/\bBNS\s*(?:Act\s*)?115\b/i,"BNS 115","sections/bns-115.html"],
    [/\bBNS\s*(?:Act\s*)?318\b/i,"BNS 318","sections/bns-318.html"],
    [/\bBNSS\s*173\b/i,"BNSS 173","sections/bnss-173.html"],
    [/\bBNSS\s*187\b/i,"BNSS 187","sections/bnss-187.html"],
    [/\bBNSS\s*479\b/i,"BNSS 479","sections/bnss-479.html"],
    [/\bBNSS\s*480\b/i,"BNSS 480","sections/bnss-480.html"],
    [/\bBNSS\s*482\b/i,"BNSS 482","sections/bnss-482.html"],
    [/\bBSA\s*63\b/i,"BSA 63","sections/bsa-63.html"],
    [/\bNDPS\s*(?:Act\s*)?20\b/i,"NDPS 20","sections/ndps-20.html"],
    [/\bNDPS\s*(?:Act\s*)?37\b/i,"NDPS 37","sections/ndps-37.html"],
    [/\bNI\s*Act\s*(?:Section\s*)?138\b|\bNegotiable\s+Instruments\s+Act\s*(?:Section\s*)?138\b/i,"NI Act 138","sections/ni-138.html"],
    [/\bHMA\s*(?:1955\s*)?(?:Section\s*)?13\b|\bHindu\s+Marriage\s+Act\s*(?:Section\s*)?13\b/i,"HMA 13","sections/hma-13.html"],
    [/\bDV\s*Act\s*(?:2005\s*)?(?:Section\s*)?12\b|\bDomestic\s+Violence\s+Act\s*(?:Section\s*)?12\b/i,"DV Act 12","sections/dv-12.html"],
    [/\bCPC\s*(?:1908\s*)?(?:Section\s*)?115\b/i,"CPC 115 (UP)","sections/cpc-115-up.html"]
  ];
  function relatedSections(text){
    const t=String(text||"");
    const seen=new Set(); const out=[];
    for(const [rx,label,url] of SECTION_LINKS){ if(rx.test(t) && !seen.has(url)){seen.add(url);out.push({label,url});} }
    return out;
  }
  function sectionLinksHTML(text,base=""){
    return relatedSections(text).map(x=>`<a class="chip section-link" href="${base}${x.url}">${esc(x.label)}</a>`).join("");
  }
  function searchIntentHTML(q=""){
    const query=String(q||"").trim();
    const hi = query ? `हिंदी में खोजें: ${esc(query)}` : "हिंदी में कानून, धारा, निर्णय या विषय खोजें";
    const en = query ? `Search in English: ${esc(query)}` : "Search in English for a law, section, judgment or legal topic";
    return `<div class="ils-search-intent" aria-label="Bilingual legal search intent"><span>${hi}</span><span>${en}</span></div>`;
  }
  function profileHTML(a){
    const photo=a.photo_url||a.profile_photo_url||"";
    const areas=split(a.primary_practice_area);
    return `<div class="profile-head">${photo?`<img src="${esc(photo)}" alt="${esc(a.advocate_name||"Advocate")}">`:`<div class="adv-photo"></div>`}
      <div><h2 style="margin:0 0 5px">${esc(a.advocate_name||"Advocate")}</h2><div class="verified">✓ Verified Network Member</div><div class="meta">${esc(a.practice_state||"India")} · ${esc(a.district_court||"Jurisdiction not specified")}</div></div></div>
      <div class="profile-grid">
        <div class="profile-item"><small>Enrollment</small><strong>${esc(a.enrollment_number||"Not publicly listed")}</strong></div>
        <div class="profile-item"><small>State Bar Council</small><strong>${esc(a.state_bar_council||"Not publicly listed")}</strong></div>
        <div class="profile-item"><small>Practice State</small><strong>${esc(a.practice_state||"Not specified")}</strong></div>
        <div class="profile-item"><small>Jurisdiction / Court</small><strong>${esc(a.district_court||"Not specified")}</strong></div>
        <div class="profile-item"><small>Years of Practice</small><strong>${esc(a.years_of_practice ?? "Not specified")}</strong></div>
        <div class="profile-item"><small>Profile Status</small><strong>Verified public profile</strong></div>
      </div>
      <div class="card"><h3>Practice Areas</h3><div class="chips">${areas.length?areas.map(x=>`<span class="chip">${esc(x)}</span>`).join(""):"Professional practice details available on profile."}</div></div>
      <div style="margin-top:14px" class="notice">Public profile information is limited to professional details. It is not a ranking, endorsement, guarantee of result or solicitation of professional services.</div>
      <div class="actions" style="margin-top:15px"><a class="btn btn-primary" href="assistance.html?advocate=${encodeURIComponent(a.id)}">Request Legal Assistance</a></div>`;
  }
  return {SUPABASE_URL,SUPABASE_KEY,esc,split,formatDate,init,ready,advocates,judgments,submitRequirement,ai,profileHTML,goSearch,relatedSections,sectionLinksHTML,searchIntentHTML};
})();
document.addEventListener("DOMContentLoaded",()=>ILS.init());
