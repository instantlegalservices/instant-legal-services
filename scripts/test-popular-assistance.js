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
    if(await cards.count()!==4)throw new Error("Expected four Popular Assistance cards.");
    const heroEnd=await page.locator("#start").evaluate(el=>el.compareDocumentPosition(document.querySelector("#popular-assistance")) & Node.DOCUMENT_POSITION_FOLLOWING);
    const businessAfter=await page.locator("#popular-assistance").evaluate(el=>el.compareDocumentPosition(document.querySelector("#business-lines")) & Node.DOCUMENT_POSITION_FOLLOWING);
    if(!heroEnd||!businessAfter)throw new Error("Popular Assistance must sit immediately after the search/intake hero and before the following homepage sections.");
    await page.selectOption("#language","en-IN");
    if(await page.locator("#popular-assistance-title").innerText()!=="Popular Assistance")throw new Error("English language did not localize Popular Assistance title.");
    if(!(await page.locator("#popular-assistance .legal small").innerText()).includes("Notices"))throw new Error("English card description remained untranslated.");
    await page.selectOption("#language","hi-IN");
    if(await page.locator("#popular-assistance-title").innerText()!=="लोकप्रिय सहायता")throw new Error("Hindi language did not localize Popular Assistance title.");
    const routes={
      legal:"popular-assistance.html?service=legal-drafting",
      recovery:"popular-assistance.html?service=money-recovery",
      gst:"popular-assistance.html?service=gst-assistance",
      traffic:"popular-assistance.html?service=traffic-challan"
    };
    for(const [key,href] of Object.entries(routes)){
      await page.goto(base+"/");
      const actual=await page.locator("#popular-assistance .popular-card."+key).getAttribute("href");
      if(actual!==href)throw new Error(key+" card route mismatch: "+actual);
      await page.goto(base+"/"+href);
      if(await page.locator("#services .service").count()!==4)throw new Error(key+" service detail page must show four service options.");
      if(!(await page.locator("#title").innerText()).trim())throw new Error(key+" service detail heading missing.");
      if(!(await page.locator("#actions a").count()))throw new Error(key+" service detail enquiry/action route missing.");
    }
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
    console.log("ALL_FOUR_SERVICE_DETAIL_ROUTES=PASS");
    console.log("GST_EXISTING_ENQUIRY_PREFILL=PASS");
    console.log("LEGAL_DRAFTING_AND_MONEY_RECOVERY_INTAKE=PASS");
    console.log("GUIDED_MODE_COMPATIBILITY=PASS");
  } finally { await browser.close(); }
})().catch(error=>{console.error(error&&error.stack?error.stack:error);process.exit(1);});
