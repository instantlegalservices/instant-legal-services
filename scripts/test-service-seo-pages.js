"use strict";
const fs=require("fs");
const path=require("path");
const root=process.cwd();
const routes=["business-legal-review","case-preparation","legal-consultation","advocate-reviewed-draft","legal-document-review","legal-notice-drafting","property-due-diligence","legal-research","digital-form-assistance","official-route-guidance","accounting-reports","professional-tool-reports","tool-report-unlock","taxation-compliance","corporate-business-registration","accounting-bookkeeping","labour-hr-compliance","professional-services-network","criminal-bail-ndps"];
const sitemap=fs.readFileSync(path.join(root,"sitemap.xml"),"utf8");
for(const slug of routes){
 const route="/services/"+slug+"/";
 const file=path.join(root,"services",slug,"index.html");
 if(!fs.existsSync(file))throw new Error("Missing service SEO page: "+route);
 const html=fs.readFileSync(file,"utf8");
 const checks=[
  [/<title>[^<]{12,}<\/title>/i,"unique title"],
  [/<meta name="description" content="[^"]{60,}">/i,"descriptive meta description"],
  ['<link rel="canonical" href="https://instantlegalservices.in'+route+'">',"canonical URL"],
  [/<script type="application\/ld\+json">[\s\S]*?<\/script>/i,"JSON-LD"],
  [/<h1>[^<]+<\/h1>/i,"service heading"],
  [/Documents to keep ready|Documents to prepare|starting checklist/i,"document checklist"],
  [/Fees, scope|Important information|How the service works/i,"scope and process disclosure"]
 ];
 for(const [check,label] of checks){
  if(typeof check==="string"?!html.includes(check):!check.test(html))throw new Error(route+" missing "+label);
 }
 const checklist=html.match(/<h2>Documents to (?:keep ready|prepare)<\/h2>([\s\S]*?)<\/section>/i)?.[1]||"";
 const documentItems=[...checklist.matchAll(/<li>(.*?)<\/li>/gi)].map(match=>match[1].replace(/<[^>]*>/g,"").trim()).filter(Boolean);
 if(documentItems.length<3||documentItems.length>8)throw new Error(route+" must provide a practical document checklist of 3–8 items.");
 if(new Set(documentItems.map(item=>item.toLowerCase())).size!==documentItems.length)throw new Error(route+" contains duplicate document checklist items.");
 if(!/case facts|jurisdiction|as applicable|where relevant|if available|subject to/i.test(html))throw new Error(route+" must qualify documents and service scope against facts and jurisdiction.");
 if(!sitemap.includes("https://instantlegalservices.in"+route))throw new Error(route+" missing from sitemap.xml");
}
for(const slug of routes){
 const html=fs.readFileSync(path.join(root,"services",slug,"index.html"),"utf8");
 if(/href="\.\.\/assistance\.html(?:\?|")/i.test(html))throw new Error("/services/"+slug+"/ has a broken relative assistance link; use the root assistance route.");
 if(/href="[^"]*assistance\.html(?:\?|")/i.test(html)&&!/href="\/assistance\.html\?/i.test(html))throw new Error("/services/"+slug+"/ assistance CTA must target the root assistance page.");
}
const hub=fs.readFileSync(path.join(root,"services","index.html"),"utf8");
for(const token of ['<link rel="canonical" href="https://instantlegalservices.in/services/">','<h1>Find the right professional service','<script type="application/ld+json">'])if(!hub.includes(token))throw new Error("Services directory missing "+token);
if(!sitemap.includes("https://instantlegalservices.in/services/"))throw new Error("Services directory missing from sitemap.xml");
if(!hub.includes('href="/services/property-due-diligence/"')||hub.includes('href="/services/property-documentation/"'))throw new Error("Services directory property branch must point to the canonical property due-diligence route.");
const oldRoutes=["consumer-banking-disputes","cyber-fraud-assistance","gst-assistance","income-tax-itr","legal-drafting","matrimonial-family","money-recovery","property-documentation","traffic-challan"];
for(const slug of oldRoutes){
 const route="/services/"+slug+"/";
 if(!fs.existsSync(path.join(root,"services",slug,"index.html")))throw new Error("Legacy service route removed: "+route);
 if(!sitemap.includes("https://instantlegalservices.in"+route))throw new Error("Legacy canonical missing from sitemap: "+route);
}
console.log("SERVICE_SEO_PAGES_AND_SITEMAP=PASS ("+routes.length+" new detailed routes + service directory; "+oldRoutes.length+" legacy routes preserved)");
