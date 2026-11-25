"use strict";
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    const mock = String.raw`window.__pricingMockCalls = [];
window.supabase = {
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    rpc: async () => ({ data: false, error: null }),
    from(table) {
      const query = {
        table, columns: "", filters: [],
        select(columns) { this.columns = columns; return this; },
        order() { return this; },
        eq(column, value) { this.filters.push([column, value]); return this; },
        limit() { return this; },
        then(resolve, reject) {
          window.__pricingMockCalls.push({ table: this.table, columns: this.columns, filters: this.filters });
          let result;
          if (this.table === "services" && this.columns.includes("category")) {
            result = { data: null, error: { code: "42703", message: "column services.category does not exist" } };
          } else if (this.table === "services") {
            result = { data: [
              { id: "service-enquiry", slug: "ils-enquiry-fee-199", name: "ILS Initial Enquiry & Coordination", status: "active" }
            ], error: null };
          } else if (this.table === "professional_fee_catalog" || this.table === "ils_admin_pricing_audit") {
            result = { data: null, error: { code: "PGRST205", message: "table not found in schema cache" } };
          } else if (this.table === "service_prices" && this.columns.includes("price")) {
            result = { data: null, error: { code: "42703", message: "column service_prices.price does not exist" } };
          } else if (this.table === "service_prices" && this.columns.includes("amount")) {
            result = { data: [
              { id: "price-enquiry", service_id: "service-enquiry", amount: 299, currency: "INR", is_active: true, fee_adjustment_enabled: true, fee_adjustment_amount: 299, created_at: "2026-11-25T00:00:00Z" }
            ], error: null };
          } else {
            result = { data: [], error: null };
          }
          return Promise.resolve(result).then(resolve, reject);
        }
      };
      return query;
    }
  })
};`;

    await page.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2", route =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: mock })
    );

    const base = (process.env.BASE_URL || "http://127.0.0.1:4173").replace(/\/$/, "");
    await page.goto(base + "/admin.html", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.loadPricingControls === "function", null, { timeout: 10000 });
    await page.evaluate(() => window.loadPricingControls());

    const result = await page.evaluate(() => ({
      pricingRows: document.querySelectorAll("#pricingBody tr").length,
      pricingText: document.getElementById("pricingBody")?.innerText || "",
      priceValue: document.querySelector("#pricingBody .pricingNewValue")?.value || "",
      adjustmentChecked: Boolean(document.querySelector("#pricingBody .pricingAdjustmentEnabled")?.checked),
      adjustmentAmount: document.querySelector("#pricingBody .pricingAdjustmentAmount")?.value || "",
      feeUnavailable: document.getElementById("professionalFeeBody")?.innerText || "",
      feeFormDisabled: [...(document.getElementById("professionalFeeForm")?.querySelectorAll("input,select,button") || [])].every(el => el.disabled),
      auditUnavailable: document.getElementById("pricingAuditBody")?.innerText || "",
      calls: window.__pricingMockCalls || []
    }));

    if (result.pricingRows !== 1 || !result.pricingText.includes("ILS Initial Enquiry & Coordination")) {
      throw new Error("TEST schema fallback did not render the service pricing row: " + JSON.stringify(result));
    }
    if (result.priceValue !== "299") throw new Error("TEST amount column was not rendered as ₹299: " + JSON.stringify(result));
    if (!result.adjustmentChecked || result.adjustmentAmount !== "299") {
      throw new Error("TEST fee adjustment controls did not retain enabled ₹299 credit: " + JSON.stringify(result));
    }
    if (!result.feeUnavailable.includes("not configured") || !result.feeFormDisabled) {
      throw new Error("Missing professional fee catalogue was not safely isolated/disabled: " + JSON.stringify(result));
    }
    if (!result.auditUnavailable.includes("not configured")) {
      throw new Error("Missing pricing audit table was not safely isolated: " + JSON.stringify(result));
    }
    const serviceFallback = result.calls.find(call => call.table === "services" && call.columns === "id,slug,name,status");
    const priceFallback = result.calls.find(call => call.table === "service_prices" && call.columns.includes("amount") && call.columns.includes("fee_adjustment_enabled"));
    if (!serviceFallback || !priceFallback) throw new Error("Expected TEST schema fallback query sequence was not executed.");
    if (pageErrors.length) throw new Error("Browser page errors: " + pageErrors.join(" | "));

    console.log("ADMIN_PRICING_TEST_SCHEMA_RUNTIME_FALLBACK=PASS");
    console.log("ADMIN_PRICING_TEST_299_FEE_CREDIT_RUNTIME=PASS");
    console.log("ADMIN_PRICING_OPTIONAL_TABLE_ISOLATION_RUNTIME=PASS");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error("ADMIN_PRICING_RUNTIME_E2E_FAILURE:", error && error.stack ? error.stack : error);
  process.exit(1);
});
