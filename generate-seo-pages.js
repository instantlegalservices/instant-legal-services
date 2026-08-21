const fs=require("fs"),path=require("path");
const SITE=(process.env.SITE_URL||"https://instantlegalservices.in").replace(/\/$/,"");
const SB=(process.env.SUPABASE_URL||"").replace(/\/$/,"");
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!SB||!KEY)throw new Error("Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in GitHub Secrets.");

const esc=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const slug=s=>String(s??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
const list=v=>Array.isArray(v)?v.filter(Boolean):String(v??"").split(/[,|;/\n]+/).map(x=>x.trim()).filter(Boolean);
const dir=path.join(process.cwd(),"seo"); fs.rmSync(dir,{recursive:true,force:true}); fs.mkdirSync(dir,{recursive:true});

function html({title,description,heading,intro,people=[]},canonical){
 const cards=people.map(a=>`<article><h2>${esc(a.advocate_name)}</h2><p><b>Practice Area:</b> ${esc(a.primary_practice_area||"")}</p><p><b>District / Court:</b> ${esc(a.district_court||"")}</p><p><b>Practice State:</b> ${esc(a.practice_state||"")}</p>${a.experience_years?`<p><b>Experience:</b> ${esc(a.experience_years)} years</p>`:""}</article>`).join("");
 const schema={"@context":"https://schema.org","@graph":[
 {"@type":"Organization","@id":SITE+"/#organization","name":"Instant Legal Services","url":SITE+"/","telephone":"+91-8445609837","areaServed":{"@type":"Country","name":"India"}},
 {"@type":"WebPage","url":canonical,"name":title,"description":description,"inLanguage":"en-IN"}]};
 return `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1"><link rel="canonical" href="${canonical}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g,"\\u003c")}</script><style>body{margin:0;background:#07101c;color:#eef3fb;font-family:Arial,sans-serif;line-height:1.6}main{max-width:1100px;margin:auto;padding:35px 18px}a{color:#d8b56a}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px}article,.cta{background:#101d2c;border:1px solid #263344;border-radius:14px;padding:20px}h1{font-size:clamp(30px,5vw,52px);line-height:1.15}.cta{margin-top:24px}</style></head><body><main><p><a href="${SITE}/">← Instant Legal Services</a></p><h1>${esc(heading)}</h1><p>${esc(intro)}</p><div class="grid">${cards}</div><div class="cta"><h2>Need legal assistance?</h2><p>Submit your requirement to Instant Legal Services for coordination based on matter, jurisdiction and professional availability.</p><p><a href="${SITE}/#quick-access">Find Legal Assistance</a></p></div><p><small>Only approved advocates whose profiles are marked public are included. Private contact details are not displayed.</small></p></main></body></html>`;
}
function write(rel,data){const d=path.join(dir,rel);fs.mkdirSync(d,{recursive:true});const url=SITE+"/seo/"+rel+"/";fs.writeFileSync(path.join(d,"index.html"),html(data,url));return url;}

(async()=>{
 const r=await fetch(`${SB}/rest/v1/advocate_registrations?select=id,advocate_name,practice_state,district_court,primary_practice_area,experience_years,verification_status,public_profile`,{headers:{apikey:KEY,Authorization:`Bearer ${KEY}`}});
 if(!r.ok)throw new Error("Supabase "+r.status+": "+await r.text());
 const all=await r.json();
 const A=all.filter(a=>String(a.verification_status||"").toLowerCase()==="approved"&&(a.public_profile===true||String(a.public_profile).toLowerCase()==="true"));
 const urls=new Set([SITE+"/",SITE+"/about",SITE+"/services",SITE+"/contact",SITE+"/criminal-law",SITE+"/family-law"]);
 const group=(key)=>{const m=new Map();for(const a of A){const v=String(key(a)||"").trim();if(v){if(!m.has(v))m.set(v,[]);m.get(v).push(a)}}return m};

 for(const [state,p] of group(a=>a.practice_state)){urls.add(write("state/"+slug(state),{title:`Advocates and Legal Assistance in ${state} | Instant Legal Services`,description:`Explore approved public advocate profiles associated with ${state}.`,heading:`Advocates and Legal Assistance in ${state}`,intro:`Approved public network profiles associated with ${state}.`,people:p}))}
 for(const [key,p] of group(a=>(a.practice_state||"")+"|"+(a.district_court||""))){const [state,district]=key.split("|");if(!district)continue;urls.add(write(`district/${slug(state)}/${slug(district)}`,{title:`Advocates in ${district}, ${state} | Instant Legal Services`,description:`Explore approved public advocate profiles associated with ${district}, ${state}.`,heading:`Advocates in ${district}, ${state}`,intro:`Approved public network profiles associated with this district and jurisdiction.`,people:p}));urls.add(write(`court/${slug(state)}/${slug(district)}`,{title:`Advocates for ${district}, ${state} | Instant Legal Services`,description:`Explore approved public advocate profiles associated with ${district} and relevant jurisdiction.`,heading:`Advocates Associated with ${district}`,intro:`Approved public network profiles associated with this court or jurisdiction.`,people:p}))}
 const pm=new Map();for(const a of A)for(const x of list(a.primary_practice_area)){if(!pm.has(x))pm.set(x,[]);pm.get(x).push(a)}
 for(const [practice,p] of pm){urls.add(write("practice/"+slug(practice),{title:`${practice} Advocates and Legal Assistance | Instant Legal Services`,description:`Explore approved public advocate profiles associated with ${practice} matters across India.`,heading:`${practice} Advocates and Legal Assistance`,intro:`Approved public network profiles associated with this practice area.`,people:p}));for(const [state,sp] of group(a=>a.practice_state)){const f=sp.filter(a=>list(a.primary_practice_area).includes(practice));if(f.length)urls.add(write(`practice/${slug(practice)}/state/${slug(state)}`,{title:`${practice} Advocates in ${state} | Instant Legal Services`,description:`Explore approved public advocate profiles for ${practice} matters in ${state}.`,heading:`${practice} Advocates in ${state}`,intro:`Approved public network profiles relevant to this practice area and state.`,people:f}))}}
 for(const a of A){const rel=`advocate/${slug(a.advocate_name)}-${slug(a.id).slice(0,8)}`;urls.add(write(rel,{title:`${a.advocate_name} | Approved Public Advocate Profile | Instant Legal Services`,description:`Public professional profile of ${a.advocate_name}.`,heading:a.advocate_name||"Approved Network Advocate",intro:`This public profile is generated only for an approved advocate whose profile is public.`,people:[a]}))}
 const date=new Date().toISOString().slice(0,10); const x=s=>String(s).replace(/&/g,"&amp;");
 fs.writeFileSync("sitemap.xml",'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+[...urls].sort().map(u=>`<url><loc>${x(u)}</loc><lastmod>${date}</lastmod></url>`).join("\n")+"\n</urlset>\n");
 console.log(`Generated ${urls.size} URLs from ${A.length} approved public advocates.`);
})().catch(e=>{console.error(e);process.exit(1)});
