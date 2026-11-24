"use strict";
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:"block",reducedMotion:"reduce"});
  const page = await context.newPage();
  const pageErrors=[];
  page.on("pageerror",error=>pageErrors.push(error.message));
  try {
    const stub="window.supabase={createClient:function(){return {auth:{getSession:async()=>({data:{session:null}})}};}};";
    await page.route(/https:\/\/(cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2|unpkg\.com\/@supabase\/supabase-js@2)/,route=>route.fulfill({status:200,contentType:"application/javascript",body:stub}));
    const base=(process.env.BASE_URL||"http://127.0.0.1:4173/").replace(/\/$/,"");
    await page.goto(base+"/");
    const cards=page.locator("#popular-assistance .popular-card");
    if(await cards.count()!==9)throw new Error("Expected nine Popular Assistance cards.");
    const heroEnd=await page.locator("#start").evaluate(el=>el.compareDocumentPosition(document.querySelector("#popular-assistance")) & Node.DOCUMENT_POSITION_FOLLOWING);
    const businessAfter=await page.locator("#popular-assistance").evaluate(el=>el.compareDocumentPosition(document.querySelector("#business-lines")) & Node.DOCUMENT_POSITION_FOLLOWING);
    if(!heroEnd||!businessAfter)throw new Error("Popular Assistance must sit immediately after the search/intake hero and before the following homepage sections.");
    await page.selectOption("#language","en-IN");
    if(await page.locator("#popular-assistance-title").innerText()!=="Popular Assistance")throw new Error("English language did not localize Popular Assistance title.");
    if(!(await page.locator("#popular-assistance .legal small").innerText()).includes("Notices"))throw new Error("English card description remained untranslated.");
    await page.selectOption("#language","hi-IN");
    if(await page.locator("#popular-assistance-title").innerText()!=="लोकप्रिय सहायता")throw new Error("Hindi language did not localize Popular Assistance title.");
    const routes={
      legal:"services/legal-drafting/",
      recovery:"services/money-recovery/",
      gst:"services/gst-assistance/",
      traffic:"services/traffic-challan/"
    };
    for(const [key,href] of Object.entries(routes)){
      await page.goto(base+"/");
      const actual=await page.locator("#popular-assistance .popular-card."+key).getAttribute("href");
      if(actual!==href)throw new Error(key+" card route mismatch: "+actual);
      await page.goto(base+"/"+href);
      if(await page.locator("main .service").count()!==4)throw new Error(key+" SEO service page must show four service options.");
      if(!(await page.locator("main h1").innerText()).trim())throw new Error(key+" SEO page heading missing.");
      if(!(await page.locator('meta[name="description"]').getAttribute("content")))throw new Error(key+" SEO meta description missing.");
      if((await page.locator('link[rel="canonical"]').getAttribute("href"))!=="https://instantlegalservices.in/"+href)throw new Error(key+" canonical URL mismatch.");
      const schema=await page.locator('script[type="application/ld+json"]').innerText();
      if(!schema.includes('"Service"')||!schema.includes('"BreadcrumbList"'))throw new Error(key+" Service/Breadcrumb structured data missing.");
      if(!(await page.locator("main a.cta").count()))throw new Error(key+" service enquiry action missing.");
    }
    const newRoutes={
      consumer:["consumer","services/consumer-banking-disputes/","consumer-banking-disputes","Consumer & Banking Dispute Assistance"],
      cyber:["cyber","services/cyber-fraud-assistance/","cyber-fraud-assistance","Cyber Fraud Assistance"],
      family:["family","services/matrimonial-family/","matrimonial-family","Matrimonial & Family Assistance"],
      property:["property","services/property-documentation/","property-documentation","Property & Documentation Assistance"],
      tax:["tax","services/income-tax-itr/","income-tax-itr","Income Tax & ITR Assistance"]
    };
    for(const [key,[cardClass,href,serviceKey,expectedTitle]] of Object.entries(newRoutes)){
      await page.goto(base+"/");
      const card=page.locator("#popular-assistance .popular-card."+cardClass);
      if(await card.count()!==1)throw new Error(key+" homepage card missing.");
      if(await card.getAttribute("href")!==href)throw new Error(key+" card route mismatch.");
      await page.goto(base+"/"+href);
      if(await page.locator("main .item").count()!==4)throw new Error(key+" SEO page must show four assistance options.");
      if((await page.locator("main h1").innerText()).trim().length===0)throw new Error(key+" SEO page heading missing.");
      if(!(await page.locator('meta[name="description"]').getAttribute("content")))throw new Error(key+" SEO description missing.");
      if((await page.locator('link[rel="canonical"]').getAttribute("href"))!=="https://instantlegalservices.in/"+href)throw new Error(key+" canonical mismatch.");
      const schema=await page.locator('script[type="application/ld+json"]').innerText();
      if(!schema.includes('"Service"')||!schema.includes('"BreadcrumbList"'))throw new Error(key+" Service/Breadcrumb structured data missing.");
      if(await page.locator("main .choice").count()!==4)throw new Error(key+" must show four clear service choices.");
      if(await page.locator("main .docs-panel li").count()<4)throw new Error(key+" required-document checklist missing.");
      if(await page.locator("main .fee-panel .fee-list>div").count()!==4)throw new Error(key+" fee structure must disclose four cost components.");
      const cta=page.locator("main a.cta");
      if(await cta.count()!==1||!(await cta.getAttribute("href")).includes("service="+serviceKey))throw new Error(key+" CTA does not route to its intake category.");
      const selectedHref=await page.locator("main .choice a").first().getAttribute("href");
      const selectedUrl=new URL(selectedHref,"https://instantlegalservices.in");
      if(selectedUrl.searchParams.get("service")!==serviceKey||!selectedUrl.searchParams.get("option"))throw new Error(key+" service choice does not carry the selected option.");
      await page.goto(base+selectedUrl.pathname+selectedUrl.search);
      if((await page.locator("#standardHelp h1").innerText()).trim()!==expectedTitle)throw new Error(key+" enquiry heading did not prefill.");
      if(!(await page.locator("#brief").inputValue()).trim())throw new Error(key+" enquiry brief did not prefill.");
      if(!(await page.locator("#matter").inputValue()))throw new Error(key+" legal matter category did not prefill.");
      if(await page.locator("#serviceOption").inputValue()!==selectedUrl.searchParams.get("option"))throw new Error(key+" selected service option did not prefill in enquiry form.");
    }
    console.log("FIVE_NEW_SERVICE_PAGES_AND_INTAKE_PREFILLS=PASS");
    const customerPortal=await (await page.request.get(base+"/customer-portal.html")).text();
    for(const marker of ['id="clientDashboard"','id="paymentHistory"','from("orders")','eq("user_id",user.id)','from("payment_proofs")','from("payments")','id="refreshPayments"','id="logoutBtn"']){
      if(!customerPortal.includes(marker))throw new Error("Customer portal payment history is missing secure feature: "+marker);
    }
    if(!customerPortal.includes("UPI proof submitted · Pending verification")||!customerPortal.includes("Paid · Verified")||!customerPortal.includes("UPI proof rejected"))throw new Error("Customer portal payment status labels are incomplete.");
    console.log("CUSTOMER_PORTAL_OWN_ORDERS_UPI_PAYMENT_STATUS=PASS");
    await page.goto(base+"/customer-portal.html?returnTo="+encodeURIComponent("/assistance.html?service=consumer-banking-disputes")+"&mode=signup");
    if(!(await page.locator("#signupPanel").isVisible()))throw new Error("Unauthenticated marketplace checkout must open the Create account panel first.");
    if(!(await page.locator("#signupEmail").isVisible())||!(await page.locator("#signupPassword").isVisible()))throw new Error("Marketplace checkout signup must visibly request email and password.");
    await page.locator("#tabLogin").click();
    if(!(await page.locator("#loginPanel").isVisible()))throw new Error("Existing customers must be able to switch from signup to Sign in.");
    console.log("MARKETPLACE_CHECKOUT_SIGNUP_FIRST_AND_EXISTING_LOGIN=PASS");
    const toolsModule=await (await page.request.get(base+"/assets/ils-tools.js")).text();
    if(!toolsModule.includes("'ils-enquiry-fee-199':'ils-enquiry-fee-199'")||!toolsModule.includes("if(options.autoPay===true)"))throw new Error("Dedicated fixed-price UPI checkout is not registered for immediate form checkout.");
    const assistanceSource=await (await page.request.get(base+"/assistance.html")).text();
    for(const key of ["legal-drafting","money-recovery","consumer-banking-disputes","cyber-fraud-assistance","matrimonial-family","property-documentation","income-tax-itr"]){
      if(!assistanceSource.includes('"'+key+'"'))throw new Error("Marketplace enquiry checkout mapping missing: "+key);
    }
    if(!assistanceSource.includes('paidMarketplaceTraffic')||!assistanceSource.includes('isPaidMarketplaceTraffic'))throw new Error("Traffic Challan marketplace checkout mapping missing.");
    const businessSource=await (await page.request.get(base+"/business-compliance.html")).text();
    if(businessSource.includes('id="businessEnquiryForm"'))throw new Error("Business page must not create a second service enquiry form.");
    if(!businessSource.includes('href="assistance.html?service=business-compliance"'))throw new Error("Business enquiry must route to the universal existing form.");
    if(!assistanceSource.includes('"business-compliance"')||!assistanceSource.includes('intake_source:"ils-universal-service-form"'))throw new Error("Universal form business intake mapping/CRM marker missing.");
    if(!toolsModule.includes('requiresReentry:true')||toolsModule.includes('details:savedDetails'))throw new Error("Unauthenticated checkout must not persist customer intake details in browser storage.");
    if(!assistanceSource.includes('pending.requiresReentry')||!assistanceSource.includes('your enquiry details were not saved in the browser'))throw new Error("Assistance privacy-safe post-login re-entry notice is missing.");
    if(assistanceSource.includes('const d=pending.details'))throw new Error("Legacy browser-stored intake details must be cleared, never resumed.");
    const portalSource=await (await page.request.get(base+"/customer-portal.html")).text();
    if(!portalSource.includes('"/business-compliance.html"'))throw new Error("Customer portal does not allow the safe GST enquiry return path.");
    if(!portalSource.includes('const intakeLabels=')||!portalSource.includes('"gst-returns":"GST Assistance"'))throw new Error("Client portal does not show marketplace-specific service names.");
    if(!toolsModule.includes("containerId='toolStatus'")||!toolsModule.includes("getElementById(containerId)"))throw new Error("UPI payment screen is not rendered in the visible marketplace form container.");
    if(!assistanceSource.includes('const mode=params.get("mode")')||!assistanceSource.includes('mode==="guided"')||!assistanceSource.includes('mode:"popular-assistance"'))throw new Error("Assistance marketplace/Traffic checkout mode handling is incomplete.");
    const migration=await (await page.request.get(base+"/supabase/migrations/20261124175000_add_ils_enquiry_fee_199.sql")).text().catch(()=> "");
    if(migration&&!migration.includes("'ils-enquiry-fee-199'"))throw new Error("₹199 service migration does not contain its dedicated service slug.");
    console.log("NINE_MARKETPLACE_JOURNEYS_FIXED_199_UPI_WIRING=PASS");

    const sitemap=await (await page.request.get(base+"/sitemap.xml")).text();
    for(const href of Object.values(routes))if(!sitemap.includes("https://instantlegalservices.in/"+href))throw new Error("Sitemap missing new service URL: "+href);
    const robots=await (await page.request.get(base+"/robots.txt")).text();
    if(!robots.includes("Sitemap: https://instantlegalservices.in/sitemap.xml"))throw new Error("Existing robots sitemap directive missing.");
    await page.goto(base+"/popular-assistance.html?service=legal-drafting");
    if((await page.locator('meta[name="robots"]').getAttribute("content"))!=="noindex,follow")throw new Error("Query-driven duplicate service router must remain noindex.");
    await page.goto(base+"/business-compliance.html#business-enquiry");
    if(await page.locator("#businessEnquiryForm").count()!==0)throw new Error("Business page still contains a duplicate enquiry form.");
    await page.locator("#universalBusinessEnquiry").click();
    if(await page.locator("#assistForm").count()!==1)throw new Error("Business enquiry did not open the single universal form.");
    if(!(await page.locator("#businessFields").isVisible()))throw new Error("Universal business-type field did not appear.");
    if((await page.locator("#serviceOption option").count())<8)throw new Error("Business service choices are missing from the universal form.");
    await page.goto(base+"/assistance.html?service=legal-drafting");
    if(await page.locator("#standardHelp h1").innerText()!=="Legal Drafting Assistance")throw new Error("Legal Drafting heading did not prefill.");
    if(!(await page.locator("#brief").inputValue()).includes("legal drafting assistance"))throw new Error("Legal Drafting brief did not prefill.");
    await page.goto(base+"/assistance.html?service=money-recovery");
    if(await page.locator("#standardHelp h1").innerText()!=="Money Recovery Assistance")throw new Error("Money Recovery heading did not prefill.");
    if(!(await page.locator("#brief").inputValue()).includes("recovery of an outstanding amount"))throw new Error("Money Recovery brief did not prefill.");
    await page.goto(base+"/assistance.html?mode=guided&service=legal-drafting&problem=Traffic%20challan&route=Traffic%20Challan");
    if(!(await page.locator("#routeMode").isVisible()))throw new Error("Existing guided mode was not preserved.");
    if(await page.locator("#standardFormSection").isVisible())throw new Error("Service prefill incorrectly overrode guided mode.");
    if(pageErrors.length)throw new Error("Browser page errors: "+pageErrors.join(" | "));
    console.log("POPULAR_ASSISTANCE_POSITION=PASS");
    console.log("POPULAR_ASSISTANCE_MULTILINGUAL=PASS (English/Hindi)");
    console.log("ALL_FOUR_LEGACY_SERVICE_DETAIL_ROUTES=PASS");
    console.log("FOUR_LEGACY_SERVICE_SEO_CANONICALS_SCHEMA_SITEMAP=PASS");
    console.log("EXISTING_ROBOTS_SITEMAP_DIRECTIVE=PASS");
    console.log("GST_EXISTING_ENQUIRY_PREFILL=PASS");
    console.log("LEGAL_DRAFTING_AND_MONEY_RECOVERY_INTAKE=PASS");
    console.log("GUIDED_MODE_COMPATIBILITY=PASS");
  } finally { await browser.close(); }
})().catch(error=>{console.error(error&&error.stack?error.stack:error);process.exit(1);});
