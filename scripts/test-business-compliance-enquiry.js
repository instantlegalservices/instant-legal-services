import { chromium } from "playwright";
import assert from "node:assert/strict";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:4173/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const pageErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));

try {
  await page.goto(new URL("business-compliance.html", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  assert.equal(await page.locator("form").count(), 0, "business page must not contain a duplicate service enquiry form");
  const universalLink = page.locator("#universalBusinessEnquiry");
  assert.equal(await universalLink.getAttribute("href"), "assistance.html?service=business-compliance");

  await universalLink.click();
  await page.waitForURL(/assistance\.html\?service=business-compliance/);
  assert.equal(await page.locator("#assistForm").count(), 1, "the existing universal form must be the only business intake form");
  assert.equal(await page.locator("#businessFields").isVisible(), true, "business-type field must appear for business service");
  assert.equal(await page.locator("#businessType").isVisible(), true);
  assert.equal(await page.locator("#businessType option").count(), 7, "existing business-type choices must be available");
  assert.equal(await page.locator("#serviceOption option").count(), 9, "business service choices must be available");
  assert.equal(await page.locator("#matter").inputValue(), "Commercial / Corporate");
  assert.deepEqual(pageErrors, [], "page should not produce JavaScript errors");

  console.log("PASS: business compliance uses the single existing universal service form with dynamic business/service choices.");
} finally {
  await browser.close();
}
