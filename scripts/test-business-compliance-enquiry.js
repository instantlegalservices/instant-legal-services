import { chromium } from "playwright";
import assert from "node:assert/strict";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:4173/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const pageErrors = [];

page.on("pageerror", error => pageErrors.push(error.message));
await page.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2", route =>
  route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "window.__ilsTestCapture=[];window.__ilsCreateClientCount=0;window.__ilsTestError=false;window.supabase={createClient:()=>{window.__ilsCreateClientCount++;return {from:table=>({insert:async rows=>{window.__ilsTestCapture.push({table,rows});return {error:window.__ilsTestError?{message:'PRIVATE_DB_ERROR'}:null};}})};}};"
  })
);

try {
  await page.goto(new URL("business-compliance.html", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.ILS?.submitRequirement);

  assert.equal(await page.locator("#businessEnquiryForm").count(), 1, "business enquiry form should exist");
  assert.equal(await page.evaluate(() => window.__ilsCreateClientCount), 1, "the page should create exactly one canonical Supabase client");
  assert.equal(await page.locator("#businessEnquiryForm input[type=password]").count(), 0, "initial enquiry must not require a password");

  const gridColumns = await page.locator(".bc-form-grid").evaluate(el => getComputedStyle(el).gridTemplateColumns);
  assert.equal(gridColumns.trim().split(/\s+/).length, 1, "form fields should stack on a mobile viewport");

  await page.locator("#bcName").fill("Test Business Owner");
  await page.locator("#bcMobile").fill("9876543210");
  await page.locator("#bcBusinessType").selectOption({ label: "Wholesale / Trading" });
  await page.locator("#bcService").selectOption({ label: "GST return / notice / portal issue" });
  await page.locator("#bcState").fill("Uttar Pradesh");
  await page.locator("#bcCity").fill("Bareilly");
  await page.locator("#bcBrief").fill("Need monthly GST return assistance for a wholesale business.");
  await page.locator("#bcConsent").check();
  await page.locator("#bcSubmit").click();

  await page.locator("#bcStatus").filter({ hasText: "Your enquiry has been submitted" }).waitFor();
  const captured = await page.evaluate(() => window.__ilsTestCapture);
  assert.equal(captured.length, 1, "exactly one public lead insert should occur");
  assert.equal(captured[0].table, "client_requirements");
  assert.equal(captured[0].rows[0].client_name, "Test Business Owner");
  assert.equal(captured[0].rows[0].mobile, "9876543210");
  assert.ok(!("status" in captured[0].rows[0]), "public enquiry must use the database status default");
  assert.ok(!("payment_status" in captured[0].rows[0]), "public enquiry must not write payment workflow fields");
  assert.ok(!("priority" in captured[0].rows[0]), "public enquiry must not write CRM priority fields");
  assert.match(captured[0].rows[0].legal_matter, /Business Compliance/);
  assert.ok(captured[0].rows[0].brief_requirement.includes("Wholesale / Trading"));
  assert.ok(captured[0].rows[0].brief_requirement.includes("GST return / notice / portal issue"));
  assert.equal(await page.locator("#bcName").inputValue(), "", "form should reset only after successful submission");
  await page.locator("#bcName").fill("Test Business Owner");
  await page.locator("#bcMobile").fill("9876543210");
  await page.locator("#bcBusinessType").selectOption({ label: "Wholesale / Trading" });
  await page.locator("#bcService").selectOption({ label: "GST return / notice / portal issue" });
  await page.locator("#bcBrief").fill("Retry after a temporary service failure.");
  await page.locator("#bcConsent").check();
  await page.evaluate(() => { window.__ilsTestError = true; });
  await page.locator("#bcSubmit").click();
  await page.locator("#bcStatus").filter({ hasText: "please try again later or contact ILS" }).waitFor();
  const failureStatus = await page.locator("#bcStatus").innerText();
  assert.ok(!failureStatus.includes("PRIVATE_DB_ERROR"), "backend error details must not be exposed to public visitors");
  assert.equal(await page.locator("#bcName").inputValue(), "Test Business Owner", "form values should remain after failed submission");

  assert.deepEqual(pageErrors, [], "page should not produce JavaScript errors");

  console.log("PASS: mobile business enquiry submits one account-free lead with business/service context and one Supabase client.");
} finally {
  await browser.close();
}
