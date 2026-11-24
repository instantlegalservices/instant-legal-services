"use strict";
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:"block",reducedMotion:"reduce"});
  const page = await context.newPage();
  const pageErrors=[];
  page.on("pageerror",error=>pageErrors.push(error.message));
  try {
    const stub="window.supabase={createClient:function(){return {};}};";
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
      if(!schema.includes('"Service"')||!schema.includes('"FAQPage"'))throw new Error(key+" structured data missing.");
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
      if(!schema.includes('"Service"')||!schema.includes('"FAQPage"'))throw new Error(key+" structured data missing.");
      const cta=page.locator("main a.cta");
      if(await cta.count()!==1||!(await cta.getAttribute("href")).includes("service="+serviceKey))throw new Error(key+" CTA does not route to its intake category.");
      await page.goto(base+"/assistance.html?service="+serviceKey);
      if((await page.locator("#standardHelp h1").innerText()).trim()!==expectedTitle)throw new Error(key+" enquiry heading did not prefill.");
      if(!(await page.locator("#brief").inputValue()).trim())throw new Error(key+" enquiry brief did not prefill.");
    }
    console.log("FIVE_NEW_SERVICE_PAGES_AND_INTAKE_PREFILLS=PASS");
    const sitemap=await (await page.request.get(base+"/sitemap.xml")).text();
    for(const href of Object.values(routes))if(!sitemap.includes("https://instantlegalservices.in/"+href))throw new Error("Sitemap missing new service URL: "+href);
    const robots=await (await page.request.get(base+"/robots.txt")).text();
    if(!robots.includes("Sitemap: https://instantlegalservices.in/sitemap.xml"))throw new Error("Existing robots sitemap directive missing.");
    await page.goto(base+"/popular-assistance.html?service=legal-drafting");
    if((await page.locator('meta[name="robots"]').getAttribute("content"))!=="noindex,follow")throw new Error("Query-driven duplicate service router must remain noindex.");
    await page.goto(base+"/business-compliance.html?service=gst-returns#business-enquiry");
    if(await page.locator("#bcService").inputValue()!=="GST return / notice / portal issue")throw new Error("GST enquiry did not preselect the relevant existing service.");
    if(!(await page.locator("#bcBrief").inputValue()).includes("GST services"))throw new Error("GST enquiry did not prefill a useful service-specific brief.");
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
