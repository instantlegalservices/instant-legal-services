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
 if(!sitemap.includes("https://instantlegalservices.in"+route))throw new Error(route+" missing from sitemap.xml");
}
const hub=fs.readFileSync(path.join(root,"services","index.html"),"utf8");
for(const token of ['<link rel="canonical" href="https://instantlegalservices.in/services/">','<h1>Find the right professional service','<script type="application/ld+json">'])if(!hub.includes(token))throw new Error("Services directory missing "+token);
if(!sitemap.includes("https://instantlegalservices.in/services/"))throw new Error("Services directory missing from sitemap.xml");
const oldRoutes=["consumer-banking-disputes","cyber-fraud-assistance","gst-assistance","income-tax-itr","legal-drafting","matrimonial-family","money-recovery","property-documentation","traffic-challan"];
for(const slug of oldRoutes){
 const route="/services/"+slug+"/";
 if(!fs.existsSync(path.join(root,"services",slug,"index.html")))throw new Error("Legacy service route removed: "+route);
 if(!sitemap.includes("https://instantlegalservices.in"+route))throw new Error("Legacy canonical missing from sitemap: "+route);
}
console.log("SERVICE_SEO_PAGES_AND_SITEMAP=PASS ("+routes.length+" new detailed routes + service directory; "+oldRoutes.length+" legacy routes preserved)");
