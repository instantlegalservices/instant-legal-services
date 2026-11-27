"use strict";
const fs=require("fs");
const path=require("path");
const root=process.cwd();
const SITE="https://instantlegalservices.in";
const registryPath=path.join(root,"services","service-registry.json");
const registry=JSON.parse(fs.readFileSync(registryPath,"utf8"));
if(registry.site!==SITE||!Array.isArray(registry.services))throw new Error("Invalid ILS service registry.");
const esc=value=>String(value||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const seen=new Set();
const seenTitles=new Set();
const seenH1s=new Set();
const generated=[];
for(const service of registry.services){
 const slug=String(service.slug||"").trim();
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw new Error("Invalid service slug: "+slug);
 if(seen.has(slug))throw new Error("Duplicate service slug: "+slug);
 seen.add(slug);
 if(!service.title||!service.h1||String(service.description||"").length<60)throw new Error("Service metadata incomplete: "+slug);
 const titleKey=String(service.title).trim().toLowerCase(),h1Key=String(service.h1).trim().toLowerCase();
 if(seenTitles.has(titleKey))throw new Error("Duplicate service title: "+service.title);
 if(seenH1s.has(h1Key))throw new Error("Duplicate service H1: "+service.h1);
 seenTitles.add(titleKey);seenH1s.add(h1Key);
 if(!Array.isArray(service.documents)||service.documents.length<3||service.documents.length>8)throw new Error("Service checklist must contain 3–8 items: "+slug);
 const route="/services/"+slug+"/";
 const file=path.join(root,"services",slug,"index.html");
 const canonical=SITE+route;
 if(fs.existsSync(file)){
  const html=fs.readFileSync(file,"utf8");
  if(!html.includes('<link rel="canonical" href="'+canonical+'">'))throw new Error("Existing page canonical mismatch: "+route);
  const pageH1=(html.match(/<h1\\b[^>]*>([\\s\\S]*?)<\\/h1>/i)||[])[1]||"";
  const normalizedH1=pageH1.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"\'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/<[^>]*>/g,"").trim();
  if(normalizedH1!==String(service.h1).trim())throw new Error("Existing page H1 mismatch: "+route);
  if(!html.includes(esc(service.description)))throw new Error("Existing page description/scope mismatch: "+route);
  for(const item of service.documents){if(!html.includes(esc(item)))throw new Error("Existing page checklist missing registry item: "+route+" — "+item);}
 }else{
  if(process.argv.includes("--check"))throw new Error("Missing service page: "+route);
  const sections=Array.isArray(service.sections)?service.sections:[];
  const wordCount=sections.reduce((n,section)=>n+String(section.heading||"").split(/\s+/).length+(Array.isArray(section.paragraphs)?section.paragraphs.join(" ").split(/\s+/).length:0),0);
  if(sections.length<3||wordCount<250)throw new Error("Refusing to generate thin SEO page; add at least 3 substantive unique sections and 250 words: "+route);
  const docs=service.documents.map(item=>"<li>"+esc(item)+"</li>").join("");
  const body=sections.map(section=>'<section class="panel"><h2>'+esc(section.heading)+'</h2>'+section.paragraphs.map(paragraph=>'<p>'+esc(paragraph)+'</p>').join("")+'</section>').join("");
  const schema={"@context":"https://schema.org","@type":"Service","name":service.h1,"serviceType":service.h1,"provider":{"@type":"Organization","name":"Instant Legal Services","url":SITE},"areaServed":{"@type":"Country","name":"India"},"url":canonical,"description":service.description};
  const html='<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(service.title)+'</title><meta name="description" content="'+esc(service.description)+'"><meta name="robots" content="index,follow"><link rel="canonical" href="'+canonical+'"><script type="application/ld+json">'+JSON.stringify(schema).replace(/</g,"\\u003c")+'</script><style>body{margin:0;background:#07111f;color:#f8fafc;font:16px/1.65 system-ui}.wrap{max-width:900px;margin:auto;padding:24px}.panel{background:#102337;border:1px solid #33465b;border-radius:16px;padding:20px;margin:16px 0}a{color:#ffe39a}.eyebrow{color:#f2bd55;font-weight:800}h1{font-size:clamp(32px,5vw,46px)}li{margin:8px 0}</style></head><body><main class="wrap"><p class="eyebrow">INSTANT LEGAL SERVICES · SERVICE</p><h1>'+esc(service.h1)+'</h1><p>'+esc(service.summary||service.description)+'</p>'+body+'<section class="panel"><h2>Documents to keep ready</h2><ul>'+docs+'</ul><p>Final requirements depend on the matter, case facts, authority and jurisdiction. This is an initial checklist, not a substitute for a case-specific document request.</p></section><section class="panel"><h2>Fees and important information</h2><p>Fees depend on the selected scope and complexity. Any applicable initial enquiry fee is disclosed before payment and is not a court or government fee. Do not share OTPs, passwords, PINs or payment credentials.</p></section><p><a href="/catalog/">Browse the ILS Service Mart</a> · <a href="/services/">All service branches</a></p></main></body></html>';
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,html);
  generated.push(route);
 }
}
const sitemapPath=path.join(root,"sitemap.xml");
let sitemap=fs.readFileSync(sitemapPath,"utf8");
for(const service of registry.services){
 const url=SITE+"/services/"+service.slug+"/";
 const loc="<loc>"+url+"</loc>";
 const occurrences=sitemap.split(loc).length-1;
 if(occurrences>1)throw new Error("Duplicate sitemap canonical: "+url);
 if(occurrences===0){
  if(process.argv.includes("--check"))throw new Error("Sitemap missing registry route: "+url);
  sitemap=sitemap.replace("</urlset>","  <url><loc>"+url+"</loc></url>\n</urlset>");
 }
}
if(!process.argv.includes("--check"))fs.writeFileSync(sitemapPath,sitemap);
console.log("SERVICE_SEO_REGISTRY="+(process.argv.includes("--check")?"CHECK":"GENERATE")+" PASS ("+registry.services.length+" entries; "+generated.length+" new pages)");
