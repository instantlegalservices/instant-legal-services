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
   if(await page.locator(".ils-offer-card").count()!==5)throw new Error("Five launch offer cards must render above the catalogue.");
   if(await page.locator(".ils-offer-card").filter({hasText:"Society Registration"}).count()!==0)throw new Error("Society Registration must not appear as a launch offer.");
   const expectedOffers=[
    ["GST Registration","₹1,499","₹999","GST Registration – Launch Offer"],
    ["Private Limited Company Registration","₹4,999","₹3,999","Private Limited Company Registration – Launch Offer"],
    ["LLP Registration","₹3,499","₹2,499","LLP Registration – Launch Offer"],
    ["GST Return Filing","₹499","₹399","GST Return Filing – Launch Offer"],
    ["Bookkeeping","₹1,999/month","₹1,499/month","Bookkeeping – Launch Offer"]
   ];
   for(const [name,regular,offer,option] of expectedOffers){
    const card=page.locator(".ils-offer-card").filter({hasText:name});
    if(await card.count()!==1||(await card.locator("del").innerText())!==regular||(await card.locator("strong").innerText())!==offer)throw new Error("Offer price or regular fee mismatch: "+name);
    const href=await card.locator("a").getAttribute("href");
    if(!href.includes("service=business-compliance")||!decodeURIComponent(href).includes(option))throw new Error("Offer CTA does not preserve service selection: "+name);
   }
   const offerAssistance=fs.readFileSync("assistance.html","utf8");
   for(const [, , ,option] of expectedOffers)if(!offerAssistance.includes(option))throw new Error("Business intake option missing for launch offer: "+option);

   if(await page.locator(".plan-card .plan-price").count()!==6)throw new Error("All six plans must show transparent pricing or a scope-based quote.");
   if(!(await page.locator(".plan-card").filter({hasText:"Shopkeeper Starter"}).innerText()).includes("₹999"))throw new Error("Shopkeeper Starter monthly starting price missing.");
   if(!(await page.locator(".plan-card").filter({hasText:"Retailer Plus"}).innerText()).includes("₹1,999"))throw new Error("Retailer Plus monthly starting price missing.");
   if(!(await page.locator(".plan-card").filter({hasText:"Wholesaler Compliance"}).innerText()).includes("₹3,999"))throw new Error("Wholesaler monthly starting price missing.");
   if(await page.locator('section[aria-label="Government portal assistance subcategories"] .quick-need').count()!==14)throw new Error("Government portal subcategories are incomplete.");
   if(await page.locator('section[aria-label="Professional tool subcategories"] .quick-need').count()!==9)throw new Error("Professional tool subcategories are incomplete.");
   if(await page.locator("#custom-plan-builder .builder-addon").count()!==6)throw new Error("Custom plan builder must expose all six support modules.");

   if(await page.locator(".mart-category-card").count()!==6||await page.locator(".mart-category-card img").count()!==6)throw new Error("All six visual category cards must render with photos.");
   if(await page.locator(".catalog-card img").count()!==5)throw new Error("Each purchasable catalogue service must have a relevant photo.");
   if(await page.locator(".plan-card .plan-image img").count()!==6)throw new Error("Business plan cards must include relevant photos.");
   if(await page.locator('section[aria-label="Popular legal assistance areas"] .quick-need').count()!==9)throw new Error("All nine SEO-linked legal need shortcuts must remain visible.");
   if(await page.locator('section[aria-label="GST and tax service subcategories"] .quick-need').count()!==6)throw new Error("GST and tax enquiry subcategories are incomplete.");
   if(await page.locator('section[aria-label="Additional GST and tax support"] .quick-need').count()!==5)throw new Error("Additional GST and tax subcategories are incomplete.");
   if(await page.locator('section[aria-label="Business registrations and licences"] .quick-need').count()!==6)throw new Error("Business registration and licence subcategories are incomplete.");
   if(await page.locator('section[aria-label="Business legal and workforce support"] .quick-need').count()!==4)throw new Error("Business legal and workforce subcategories are incomplete.");
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
   if(href!=="../services/legal-notice-drafting/")throw new Error("Legal Notice Draft CTA must open its dedicated service detail page.");
   const toolHref=await page.locator(".catalog-card").filter({hasText:"Accounting Report Basic"}).locator("a").getAttribute("href");
   if(toolHref!=="../services/accounting-reports/")throw new Error("Accounting report CTA must open its dedicated report detail page.");
   if(await page.locator(".plan-card a").count()!==6)throw new Error("Business plans must stay enquiry-led.");
   if(await page.locator("#custom-plan-builder").count()!==1)throw new Error("Custom package builder is missing.");
   if(!(await page.locator("#builderEstimate").innerText()).includes("₹999 / month"))throw new Error("Monthly package estimate does not start at the expected base.");
   await page.locator("#builderCycle").selectOption("annual");
   if(!(await page.locator("#builderEstimate").innerText()).includes("₹9,990 / year"))throw new Error("Annual estimate must apply the 10-month annual-prepay model.");
   await page.locator('.builder-addon input[value="reconciliation"]').check();
   if(!(await page.locator("#builderEstimate").innerText()).includes("₹13,980 / year"))throw new Error("Annual add-on estimate did not recalculate.");
   await page.locator("#builderCycle").selectOption("one_time");
   if(!(await page.locator("#builderEstimate").innerText()).includes("Scope-based quote"))throw new Error("One-time project must use a scope-based quote.");
   await page.locator("#builderCycle").selectOption("monthly");
   await page.locator("#builderInvoices").selectOption("150");
   await page.locator("#builderGstins").selectOption("2");
   await page.locator('.builder-addon input[value="legal-desk"]').check();
   const customHref=await page.locator("#builderContinue").getAttribute("href");
   const customUrl=new URL(customHref,"https://ils.example/catalog/");
   if(customUrl.searchParams.get("cycle")!=="monthly"||customUrl.searchParams.get("industry")!=="Retail shop"||customUrl.searchParams.get("invoices")!=="150"||customUrl.searchParams.get("gstins")!=="2"||!customUrl.searchParams.get("modules").includes("legal-desk")||customUrl.searchParams.get("plan")!=="custom-business-plan")throw new Error("Custom plan builder did not pass the selected scope and billing preference.");
   await page.locator("#builderCycle").selectOption("monthly");
   await page.locator("#builderInvoices").selectOption("50");
   await page.locator("#builderGstins").selectOption("1");
   await page.locator('.builder-addon input[value="reconciliation"]').uncheck();
   await page.locator('.builder-addon input[value="legal-desk"]').uncheck();

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
   for(const key of ["package_billing_cycle:packageCycle||null","package_modules:packageModules","package_estimate:packageCycle!==\"one_time\"?packageEstimate:null",'Billing preference: "+packageCycleLabel']){
    if(!assistanceSource.includes(key))throw new Error("Custom plan metadata missing from CRM linkage: "+key);
   }

   for(const option of ["GST input tax credit / reconciliation","Tax notice / demand response","TDS / payroll / salary compliance","Accounting / bookkeeping / bank reconciliation","E-way bill / e-invoice support","Shop & Establishment / Trade Licence","Udyam / MSME registration","FSSAI / Food licence","Trademark / Brand protection","Labour / PF / ESI compliance","MCA / ROC / annual filing assistance"]){
    if(!assistanceSource.includes(option))throw new Error("Business enquiry subcategory missing from CRM intake: "+option);
   }

   for(const industry of ["Retail shop","Kirana / FMCG / Grocery","Showroom / General Retail","Wholesale / Trading","Distributor / C&F Agent","E-commerce / Marketplace Seller","Manufacturer","Factory / Workshop","Import / Export","Restaurant / Food Business","Hospital / Clinic","Diagnostic Lab / Pharmacy","Professional / Freelancer","Service / Consultancy","Contractor / Construction","Real Estate / Property","Education / Training","NGO / Trust / Society"]){
    if(!assistanceSource.includes("<option>"+industry.replace(/&/g,"&amp;")+"</option>"))throw new Error("Business type option missing: "+industry);
   }

   if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw new Error("Horizontal overflow at "+viewport.width+"px.");
   await context.close();
  }

  
  const homePage=await browser.newPage({viewport:{width:390,height:844}});
  const homeErrors=[];homePage.on("pageerror",e=>homeErrors.push(e.message));
  const homeSupabaseStub="window.supabase={createClient:function(){return {auth:{getSession:async()=>({data:{session:null}})}};}};";
  await homePage.route(/https:\/\/(cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2|unpkg\.com\/@supabase\/supabase-js@2)/,route=>route.fulfill({status:200,contentType:"application/javascript",body:homeSupabaseStub}));
  await homePage.goto((process.env.BASE_URL||"http://127.0.0.1:4173/").replace(/\/$/,"")+"/",{waitUntil:"domcontentloaded"});
  await homePage.locator("#language").waitFor({state:"visible"});
  if(await homePage.locator(".ils-home-offer").count()!==5)throw new Error("Homepage must show five tax/business launch offers above Popular Assistance.");
  const llpHomeOffer=homePage.locator(".ils-home-offer").filter({hasText:"LLP Registration"});
  if(await llpHomeOffer.count()!==1||!(await llpHomeOffer.innerText()).includes("₹3,499")||!(await llpHomeOffer.innerText()).includes("₹2,499"))throw new Error("Homepage LLP offer title or ILS pricing is incorrect.");
  if(await homePage.locator(".ils-home-offer").filter({hasText:"Society Registration"}).count()!==0)throw new Error("Society offer must be removed from homepage.");
  if(await homePage.locator("#ils-launch-offers").evaluate(el=>el.compareDocumentPosition(document.querySelector("#popular-assistance"))&Node.DOCUMENT_POSITION_FOLLOWING)===0)throw new Error("Homepage launch offers must appear before Popular Assistance.");
  for(const [lang,expected] of [["en-IN","Tax & Business Services at Offer Prices"],["hi-IN","GST और बिज़नेस सेवाएँ — ऑफर कीमतों पर"],["hinglish","GST & Business Services — Offer Prices"],["ur-IN","ٹیکس اور کاروباری خدمات رعایتی قیمتوں پر"],["bn-IN","কর ও ব্যবসায়িক পরিষেবা অফার মূল্যে"]]){
   await homePage.locator("#language").selectOption(lang);
   if((await homePage.locator("#ils-launch-offers h2").innerText())!==expected)throw new Error("Homepage launch offer translation missing for "+lang);
  }
  if(homeErrors.length)throw new Error("Homepage offer browser errors: "+homeErrors.join("; "));
  await homePage.close();

const intakeContext=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:"block"});
  const intakePage=await intakeContext.newPage(),intakeErrors=[];
  intakePage.on("pageerror",e=>intakeErrors.push(e.message));
  const intakeStub="window.supabase={createClient:function(){return {auth:{getSession:async()=>({data:{session:null}})}};}};";
  await intakePage.route(/https:\/\/(cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2|unpkg\.com\/@supabase\/supabase-js@2)/,route=>route.fulfill({status:200,contentType:"application/javascript",body:intakeStub}));
  const intakeBase=(process.env.BASE_URL||"http://127.0.0.1:4173/").replace(/\/$/,"");
  await intakePage.goto(intakeBase+"/assistance.html?service=business-compliance&plan=shopkeeper-starter&industry=Retail%20shop&option=GST%20registration%20%2F%20amendment");
  await intakePage.locator("#assistForm").waitFor({state:"attached"});
  if(await intakePage.locator("#businessType").inputValue()!=="Retail shop")throw new Error("Industry entry point did not prefill business type.");
  if(await intakePage.locator("#serviceOption").inputValue()!=="GST registration / amendment")throw new Error("GST subcategory did not preselect the requested service.");
  if(!(await intakePage.locator("#standardHelp h1").innerText()).includes("Shopkeeper Starter"))throw new Error("Selected business plan did not prefill the enquiry heading.");
  await intakePage.locator("#name").fill("ILS Test Customer");
  await intakePage.locator("#mobile").fill("9876543210");
  await intakePage.locator("#state").fill("Uttar Pradesh");
  await intakePage.locator("#city").fill("Bareilly");
  await intakePage.locator("#consent").check();
  await intakePage.evaluate(()=>{
   window.__ilsCapture={};
   window.ILS={submitRequirement:async payload=>{window.__ilsCapture.lead=payload;return {ok:true};}};
   window.ILS_TOOLS={createOrder:async (slug,details)=>{window.__ilsCapture.order={slug,details};return {ok:true};}};
  });
  await intakePage.locator('#assistForm button[type="submit"]').click();
  await intakePage.waitForFunction(()=>Boolean(window.__ilsCapture?.order));
  const captured=await intakePage.evaluate(()=>window.__ilsCapture);
  if(!captured.lead?.brief?.includes("Business type: Retail shop")||!captured.lead.brief.includes("Selected business plan: Shopkeeper Starter")||!captured.lead.brief.includes("Selected service: GST registration / amendment"))throw new Error("CRM lead payload did not preserve selected business type, plan and service.");
  if(captured.order.slug!=="ils-enquiry-fee-199"||captured.order.details.selected_business_plan!=="Shopkeeper Starter"||captured.order.details.business_type!=="Retail shop"||captured.order.details.service_option!=="GST registration / amendment"||captured.order.details.intake_service!=="business-compliance")throw new Error("Existing ₹299 enquiry order did not preserve business plan metadata.");
  if(intakeErrors.length)throw new Error("Assistance intake browser errors: "+intakeErrors.join("; "));
  
  await intakePage.goto(intakeBase+"/assistance.html?service=business-compliance&plan=custom-business-plan&cycle=annual&industry=Hospital%20%2F%20Clinic&invoices=150&gstins=2&modules=gst-filing%2Creconciliation%2Clegal-desk&estimate=43960");
  await intakePage.locator("#assistForm").waitFor({state:"attached"});
  if(await intakePage.locator("#businessType").inputValue()!=="Hospital / Clinic")throw new Error("Custom package industry did not prefill business type.");
  await intakePage.locator("#name").fill("ILS Custom Plan Test");
  await intakePage.locator("#mobile").fill("9876543211");
  await intakePage.locator("#state").fill("Uttar Pradesh");
  await intakePage.locator("#city").fill("Bareilly");
  await intakePage.locator("#consent").check();
  await intakePage.evaluate(()=>{
   window.__ilsCapture={};
   window.ILS={submitRequirement:async payload=>{window.__ilsCapture.lead=payload;return {ok:true};}};
   window.ILS_TOOLS={createOrder:async (slug,details)=>{window.__ilsCapture.order={slug,details};return {ok:true};}};
  });
  await intakePage.locator('#assistForm button[type="submit"]').click();
  await intakePage.waitForFunction(()=>Boolean(window.__ilsCapture?.order));
  const customCaptured=await intakePage.evaluate(()=>window.__ilsCapture);
  if(!customCaptured.lead?.brief?.includes("Billing preference: Annual prepaid")||!customCaptured.lead.brief.includes("Business profile: Hospital / Clinic")||!customCaptured.lead.brief.includes("GSTIN count: 2")||!customCaptured.lead.brief.includes("Indicative package estimate: ₹43960 / year"))throw new Error("Custom package selection was not preserved in CRM lead details.");
  if(customCaptured.order.details.package_billing_cycle!=="annual"||customCaptured.order.details.package_industry!=="Hospital / Clinic"||customCaptured.order.details.package_estimate!==43960||!customCaptured.order.details.package_modules.includes("reconciliation"))throw new Error("Custom package billing and module metadata were not preserved in order metadata.");
  if(customCaptured.order.slug!=="ils-enquiry-fee-199")throw new Error("Custom package should continue through the existing initial enquiry checkout only.");

  await intakeContext.close();
  console.log("CATALOGUE_PRODUCTION_AND_LEGACY_TEST_SCHEMA_MOBILE_DESKTOP=PASS");
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
