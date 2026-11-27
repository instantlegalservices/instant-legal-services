"use strict";
const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
 const browser=await chromium.launch({headless:true}); const failures=[];
 try {
  for(const viewport of [{width:390,height:844,legacy:false},{width:1440,height:900,legacy:true}]){
   const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},serviceWorkers:"block",reducedMotion:"reduce"});
   const page=await context.newPage(); page.on("pageerror",e=>failures.push(e.message));
   const stub = [
    "window.__legacy="+(viewport.legacy?"true":"false")+";",
    "window.__query=async function(table,columns){",
    "if(table==='services'){if(window.__legacy&&columns.includes('is_active'))return {data:null,error:{message:'legacy schema'}};return {data:[{id:'s1',slug:'legal-notice-draft',name:'Legal Notice Draft',description:'Draft a notice',category:'Drafting',status:'active'},{id:'s2',slug:'property-due-diligence',name:'Property Due Diligence',description:'Review property records',category:'Property',status:'active'},{id:'s3',slug:'official-route-guidance',name:'Official Route Guidance',description:'Understand official portals',category:'Action Assistance',status:'active'},{id:'s4',slug:'accounting-print-basic',name:'Accounting Report Basic',description:'Printable report',category:'Accounting Reports',status:'active'},{id:'s5',slug:'no-price-service',name:'Unpriced Service',description:'Must not show without active price',category:'Drafting',status:'active'},{id:'s6',slug:'gst-assistance',name:'GST Assistance',description:'GST registration and returns',category:'GST & Tax',status:'active'},{id:'s7',slug:'ils-enquiry-fee-199',name:'ILS Initial Enquiry & Coordination',description:'Internal checkout fee',category:'assistance',status:'active'}],error:null};}",
    "if(window.__legacy&&columns.includes('price'))return {data:null,error:{message:'legacy price column'}};",
    "if(window.__legacy)return {data:[{service_id:'s1',amount:499},{service_id:'s2',amount:2999},{service_id:'s3',amount:19},{service_id:'s4',amount:45},{service_id:'s6',amount:399},{service_id:'s7',amount:299}],error:null};",
    "return {data:[{service_id:'s1',price:499},{service_id:'s2',price:2999},{service_id:'s3',price:19},{service_id:'s4',price:45},{service_id:'s6',price:399},{service_id:'s7',price:299}],error:null};};",
    "window.supabase={createClient:function(){return {from:function(table){return {select:function(columns){return {eq:function(){return {order:function(){return window.__query(table,columns);}};}};}};}};}};"
   ].join("\n");
   await page.route(/https:\/\/(cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2|unpkg\.com\/@supabase\/supabase-js@2)/,route=>route.fulfill({status:200,contentType:"application/javascript",body:stub}));
   const base=(process.env.BASE_URL||"http://127.0.0.1:4173/").replace(/\/$/,"");
   await page.goto(base+"/catalog/"); await page.waitForTimeout(500);
   if(failures.length)throw new Error("Browser JS errors: "+failures.join("; "));
   if(await page.locator(".catalog-card").count()!==5)throw new Error("Only priced active services should render; status: "+await page.locator("#catalogStatus").innerText());
   if(await page.locator(".plan-card").count()!==6)throw new Error("All six business plan enquiry cards must render.");
   if(await page.locator(".mart-category-card").count()!==6||await page.locator(".mart-category-card img").count()!==6)throw new Error("All six visual category cards must render with photos.");
   if(await page.locator(".catalog-card img").count()!==5)throw new Error("Each purchasable catalogue service must have a relevant photo.");
   if(await page.locator(".plan-card .plan-image img").count()!==6)throw new Error("Business plan cards must include relevant photos.");
   if(await page.locator('section[aria-label="Popular legal assistance areas"] .quick-need').count()!==9)throw new Error("All nine SEO-linked legal need shortcuts must remain visible.");
   if(await page.locator('section[aria-label="GST and tax service subcategories"] .quick-need').count()!==6)throw new Error("GST and tax enquiry subcategories are incomplete.");
   if(await page.locator('section[aria-label="Business support by industry"] .quick-need').count()!==16)throw new Error("Industry-specific business entry points are incomplete.");
   if(!(await page.locator(".catalog-card").filter({hasText:"Legal Notice Draft"}).innerText()).includes("₹499"))throw new Error("Active service price not displayed.");
   if(!(await page.locator(".catalog-card").filter({hasText:"Legal Notice Draft"}).innerText()).includes("₹299 initial enquiry"))throw new Error("Service enquiry-credit disclosure is missing.");
   if(await page.locator(".catalog-card").filter({hasText:"Unpriced Service"}).count()!==0)throw new Error("Unpriced service must not appear purchasable.");
   if(await page.locator(".catalog-card").filter({hasText:"ILS Initial Enquiry"}).count()!==0)throw new Error("Internal ₹299 enquiry checkout SKU must not appear as a standalone service.");
   await page.locator("#catalogSearch").fill("property");
   if(await page.locator(".catalog-card").count()!==1||!(await page.locator(".catalog-card").first().innerText()).includes("Property Due Diligence"))throw new Error("Search filter failed.");
   await page.locator("#catalogSearch").fill("");
   if(!viewport.legacy){
    await page.locator("#catalogCategory").selectOption("tax");
    if(await page.locator(".catalog-card").count()!==2)throw new Error("GST & tax category filter failed.");
    await page.locator("#catalogSubcategory").selectOption("Accounting & bookkeeping reports");
    if(await page.locator(".catalog-card").count()!==1||!(await page.locator(".catalog-card").first().innerText()).includes("Accounting Report Basic"))throw new Error("Accounting report subcategory filter failed.");
    await page.locator("#catalogSubcategory").selectOption("all");
    await page.locator("#catalogCategory").selectOption("government");
    if(await page.locator(".catalog-card").count()!==1||!(await page.locator(".catalog-card").first().innerText()).includes("Official Route Guidance"))throw new Error("Category filter failed.");
    await page.locator("#catalogCategory").selectOption("all");
   }
   const href=await page.locator(".catalog-card").filter({hasText:"Legal Notice Draft"}).locator("a").getAttribute("href");
   if(href!=="../assistance.html?service=legal-notice-draft")throw new Error("Service CTA slug mismatch.");
   const toolHref=await page.locator(".catalog-card").filter({hasText:"Accounting Report Basic"}).locator("a").getAttribute("href");
   if(toolHref!=="../tools.html")throw new Error("Accounting report must route to the existing 208-tool report checkout.");
   if(await page.locator(".plan-card a").count()!==6)throw new Error("Business plans must stay enquiry-led.");
   const planSlugs=["shopkeeper-starter","retailer-plus","wholesaler-compliance","manufacturer-support","hospital-clinic-support","custom-business-plan"];
   for(const slug of planSlugs){
    const planLink=page.locator('.plan-card a[href*="plan='+slug+'"]');
    if(await planLink.count()!==1)throw new Error("Business plan CTA missing exact plan handoff: "+slug);
   }
   const assistanceSource=fs.readFileSync("assistance.html","utf8");
   for(const [slug,label] of [["shopkeeper-starter","Shopkeeper Starter"],["retailer-plus","Retailer Plus"],["wholesaler-compliance","Wholesaler Compliance"],["manufacturer-support","Manufacturer Support"],["hospital-clinic-support","Hospital & Clinic Support"],["custom-business-plan","Custom Business Plan"]]){
    if(!assistanceSource.includes('"'+slug+'":"'+label+'"'))throw new Error("Assistance intake does not map plan "+slug);
   }
   if(!assistanceSource.includes("Selected business plan: \"+selectedBusinessPlan")||!assistanceSource.includes("selected_business_plan:selectedBusinessPlan||null")||!assistanceSource.includes("await ILS.submitRequirement(inquiryPayload)"))throw new Error("Business plan selection must be preserved in CRM lead and order metadata before checkout.");

   for(const slug of ["legal-consultation","legal-notice-draft","custom-legal-drafting","advocate-reviewed-draft","document-review","case-preparation-pack","legal-research-report","business-legal-review","property-due-diligence","digital-form-assistance","official-route-guidance"]){
    if(!assistanceSource.includes('"'+slug+'":{title:'))throw new Error("Service intake mapping missing for "+slug);
   }
   if(!assistanceSource.includes("industryParam")||!assistanceSource.includes("value===industryParam"))throw new Error("Business industry shortcut does not preselect CRM business type.");
   for(const industry of ["Retail shop","Kirana / FMCG / Grocery","Showroom / General Retail","Wholesale / Trading","Distributor / C&F Agent","E-commerce / Marketplace Seller","Manufacturer","Factory / Workshop","Import / Export","Restaurant / Food Business","Hospital / Clinic","Diagnostic Lab / Pharmacy","Professional / Freelancer","Service / Consultancy","Contractor / Construction","Real Estate / Property","Education / Training","NGO / Trust / Society"]){
    if(!assistanceSource.includes("<option>"+industry.replace(/&/g,"&amp;")+"</option>"))throw new Error("Business type option missing: "+industry);
   }

   if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw new Error("Horizontal overflow at "+viewport.width+"px.");
   await context.close();
  }
  console.log("CATALOGUE_PRODUCTION_AND_LEGACY_TEST_SCHEMA_MOBILE_DESKTOP=PASS");
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
