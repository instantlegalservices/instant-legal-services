"use strict";
const { chromium } = require("playwright");
(async () => {
 const browser=await chromium.launch({headless:true}); const failures=[];
 try {
  for(const viewport of [{width:390,height:844,legacy:false},{width:1440,height:900,legacy:true}]){
   const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},serviceWorkers:"block",reducedMotion:"reduce"});
   const page=await context.newPage(); page.on("pageerror",e=>failures.push(e.message));
   const stub='const legacy='+viewport.legacy+';window.supabase={createClient:function(){return {from:function(table){return {select:function(columns){return {eq:function(){return {order:async function(){if(table==="services"){if(legacy&&columns.includes("is_active"))return {data:null,error:{message:"column is_active missing"}};return {data:[{id:"s1",slug:"legal-notice-draft",name:"Legal Notice Draft",description:"Draft a notice",category:"Drafting",status:"active"},{id:"s2",slug:"property-due-diligence",name:"Property Due Diligence",description:"Review property records",category:"Property",status:"active"},{id:"s3",slug:"official-route-guidance",name:"Official Route Guidance",description:"Understand official portals",category:"Action Assistance",status:"active"},{id:"s4",slug:"accounting-print-basic",name:"Accounting Report Basic",description:"Printable report",category:"Accounting Reports",status:"active"},{id:"s5",slug:"no-price-service",name:"Unpriced Service",description:"Must not show without an active price",category:"Drafting",status:"active"}],error:null};}if(legacy&&columns.includes("price"))return {data:null,error:{message:"column price missing"}};if(legacy)return {data:[{service_id:"s1",amount:499},{service_id:"s2",amount:2999},{service_id:"s3",amount:19},{service_id:"s4",amount:45}],error:null};return {data:[{service_id:"s1",price:499},{service_id:"s2",price:2999},{service_id:"s3",price:19},{service_id:"s4",price:45}],error:null};}}}}}};}}};';
   await page.route(/https:\/\/(cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2|unpkg\.com\/@supabase\/supabase-js@2)/,route=>route.fulfill({status:200,contentType:"application/javascript",body:stub}));
   const base=(process.env.BASE_URL||"http://127.0.0.1:4173/").replace(/\/$/,"");
   await page.goto(base+"/catalog/"); await page.locator(".catalog-card").first().waitFor();
   if(await page.locator(".catalog-card").count()!==4)throw new Error("Only services with active prices should render ("+viewport.width+").");
   if(await page.locator(".plan-card").count()!==6)throw new Error("All six business plan enquiry cards must render.");
   if(!(await page.locator(".catalog-card").filter({hasText:"Legal Notice Draft"}).innerText()).includes("₹499"))throw new Error("Active service price not displayed.");
   if(await page.locator(".catalog-card").filter({hasText:"Unpriced Service"}).count()!==0)throw new Error("Unpriced service must not appear purchasable.");
   await page.locator("#catalogSearch").fill("property");
   if(await page.locator(".catalog-card").count()!==1||!(await page.locator(".catalog-card").first().innerText()).includes("Property Due Diligence"))throw new Error("Search filter failed.");
   await page.locator("#catalogSearch").fill("");
   if(!viewport.legacy){
    await page.locator("#catalogCategory").selectOption("government");
    if(await page.locator(".catalog-card").count()!==1||!(await page.locator(".catalog-card").first().innerText()).includes("Official Route Guidance"))throw new Error("Category filter failed.");
    await page.locator("#catalogCategory").selectOption("all");
   }
   const href=await page.locator(".catalog-card").filter({hasText:"Legal Notice Draft"}).locator("a").getAttribute("href");
   if(href!=="../assistance.html?service=legal-notice-draft")throw new Error("Service CTA slug mismatch.");
   if(await page.locator(".plan-card a").count()!==6)throw new Error("Business plans must stay enquiry-led.");
   if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw new Error("Horizontal overflow at "+viewport.width+"px.");
   if(failures.length)throw new Error("Browser JS errors: "+failures.join("; "));
   await context.close();
  }
  console.log("CATALOGUE_PRODUCTION_AND_LEGACY_TEST_SCHEMA_MOBILE_DESKTOP=PASS");
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
