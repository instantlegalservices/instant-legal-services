import { chromium } from "playwright";
import assert from "node:assert/strict";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:4173/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const pageErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));

await page.route("https://unpkg.com/@supabase/supabase-js@2", route =>
  route.fulfill({ status: 200, contentType: "application/javascript", body: "window.supabase={};" })
);
await page.route("**/assets/ils-core.js*", route =>
  route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "window.__submittedLead=null;window.ILS={};"
  })
);
await page.route("**/assets/ils-payments.js*", route =>
  route.fulfill({ status: 200, contentType: "application/javascript", body: "" })
);
await page.route("**/assets/ils-tools.js*", route =>
  route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "window.__orderCall=null;window.ILS_TOOLS={};"
  })
);

try {
  // Both the multilingual service router and the dedicated GST page must
  // point straight to the single universal form with the GST option preselected.
  const routerSource = await (await page.request.get(baseUrl + "/popular-assistance.html")).text();
  const gstLandingSource = await (await page.request.get(baseUrl + "/services/gst-assistance/")).text();
  if ((routerSource.match(/assistance\.html\?service=business-compliance&option=GST%20return%20%2F%20notice%20%2F%20portal%20issue/g) || []).length !== 5) throw new Error("All multilingual GST router CTAs must open the universal form directly.");
  if (!gstLandingSource.includes("/assistance.html?service=business-compliance&amp;option=GST%20return%20%2F%20notice%20%2F%20portal%20issue")) throw new Error("Dedicated GST landing page must open the universal form directly.");

  await page.goto(new URL("business-compliance.html", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  assert.equal(await page.locator("form").count(), 0, "business page must not contain a duplicate service enquiry form");
  const universalLink = page.locator("#universalBusinessEnquiry");
  assert.equal(await universalLink.getAttribute("href"), "assistance.html?service=business-compliance");

  await universalLink.click();
  await page.waitForURL(/assistance\.html\?service=business-compliance/);
  assert.equal(await page.locator("#assistForm").count(), 1, "the existing universal form must be the only business intake form");
  assert.equal(await page.locator("#businessFields").isVisible(), true, "business-type field must appear for business service");
  assert.equal(await page.locator("#businessType option").count(), 7, "business-type choices must be available");
  assert.equal(await page.locator("#serviceOption option").count(), 9, "business service choices must be available");
  assert.equal(await page.locator("#matter").inputValue(), "Commercial / Corporate");

  // All catalogue service enquiries now use the configurable initial enquiry fee
  // and must retain the CRM requirement ID in the checkout payload.
  await page.locator("#name").fill("Test Business Owner");
  await page.locator("#mobile").fill("9876543210");
  await page.locator("#state").fill("Uttar Pradesh");
  await page.locator("#city").fill("Bareilly");
  await page.locator("#businessType").selectOption({ label: "Wholesale / Trading" });
  await page.locator("#serviceOption").selectOption({ label: "Business registration" });
  await page.locator("#brief").fill("Need Udyam and shop registration guidance.");
  await page.locator("#consent").check();
  await page.evaluate(() => {
    window.__submittedLead = null;
    window.__orderCall = null;
    window.ILS.ready = () => ({ auth: { getUser: async () => ({ data: { user: { id: "ci-business-client" } }, error: null }) } });
    window.ILS.submitRequirement = async payload => { window.__submittedLead = payload; return 4321; };
    window.ILS_TOOLS.createOrder = async (...args) => { window.__orderCall = args; };
  });
  await page.locator("#assistForm button[type=submit]").click();
  await page.locator("#assistStatus").filter({ hasText: "Preparing your ₹299 initial enquiry payment" }).waitFor();
  const lead = await page.evaluate(() => window.__submittedLead);
  const businessOrder = await page.evaluate(() => window.__orderCall);
  assert.equal(lead.name, "Test Business Owner");
  assert.equal(lead.mobile, "9876543210");
  assert.equal(lead.state, "Uttar Pradesh", "state must be passed to the existing CRM insert");
  assert.equal(lead.city, "Bareilly", "city must be passed to the existing CRM insert");
  assert.ok(lead.brief.includes("Wholesale / Trading"));
  assert.ok(lead.brief.includes("Business registration"));
  assert.equal(businessOrder[0], "ils-enquiry-fee-199");
  assert.equal(businessOrder[1].client_requirement_id, 4321, "business catalogue order must link its saved CRM lead");

  // Legacy GST URL continues to open the same form with its paid option preselected.
  await page.goto(new URL("business-compliance.html?service=gst-returns", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await page.locator("#universalBusinessEnquiry").click();
  await page.waitForURL(/assistance\.html\?service=business-compliance/);
  assert.equal(await page.locator("#serviceOption").inputValue(), "GST return / notice / portal issue");
  await page.locator("#name").fill("Test GST Business Owner");
  await page.locator("#mobile").fill("9876543210");
  await page.locator("#state").fill("Uttar Pradesh");
  await page.locator("#city").fill("Bareilly");
  await page.locator("#businessType").selectOption({ label: "Wholesale / Trading" });
  await page.locator("#brief").fill("Need monthly GST return assistance.");
  await page.locator("#consent").check();
  await page.evaluate(() => {
    window.__orderCall = null;
    window.ILS.ready = () => ({ auth: { getUser: async () => ({ data: { user: { id: "ci-gst-client" } }, error: null }) } });
    window.ILS.submitRequirement = async payload => { window.__submittedLead = payload; return 4322; };
    window.ILS_TOOLS.createOrder = async (...args) => { window.__orderCall = args; };
  });
  await page.locator("#assistForm button[type=submit]").click();
  await page.locator("#assistStatus").filter({ hasText: "Preparing your ₹299 initial enquiry payment" }).waitFor();
  const order = await page.evaluate(() => window.__orderCall);
  assert.equal(order[0], "ils-enquiry-fee-199", "GST route must use the existing fixed-price service");
  assert.equal(order[1].intake_source, "ils-client-portal-service-catalogue");
  assert.equal(order[1].client_requirement_id, 4322);
  assert.equal(order[1].business_type, "Wholesale / Trading");
  assert.equal(order[1].state, "Uttar Pradesh");
  assert.equal(order[1].city, "Bareilly");

  assert.deepEqual(pageErrors, [], "page should not produce JavaScript errors");
  console.log("PASS: one universal business form; business and GST catalogue checkout paths; CRM payload and payment-order linkage verified.");
} finally {
  await browser.close();
}
