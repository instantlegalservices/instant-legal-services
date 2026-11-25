"use strict";
const { chromium } = require("playwright");

(async () => {
  if (!process.env.ILS_TEST_ADMIN_EMAIL || !process.env.ILS_TEST_ADMIN_PASSWORD) {
    console.log("ADMIN_PRICING_LIVE_READONLY=SKIPPED (TEST admin credentials are not configured)");
    return;
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    const restMutations = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("request", request => {
      const url = request.url();
      if (!url.includes("/rest/v1/")) return;
      const method = request.method().toUpperCase();
      const isReadOnlyRpc = method === "POST" && /\/rest\/v1\/rpc\/ils_is_admin(?:\?|$)/.test(url);
      if (!["GET", "HEAD"].includes(method) && !isReadOnlyRpc) {
        restMutations.push({ method, url: url.split("?")[0] });
      }
    });

    await page.addInitScript(({ url, key }) => {
      window.ILS_SUPABASE_URL = url;
      window.ILS_SUPABASE_KEY = key;
    }, {
      url: "https://bgsbuepolooybdqrzmoa.supabase.co",
      key: process.env.ILS_TEST_SUPABASE_KEY
    });

    const base = (process.env.BASE_URL || "http://127.0.0.1:4173").replace(/\/$/, "");
    await page.goto(base + "/admin.html", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.loadPricingControls === "function" && typeof window.isAdmin === "function");

    const result = await page.evaluate(async ({ email, password }) => {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, reason: "TEST_ADMIN_LOGIN_FAILED: " + String(error.message || "unknown").slice(0, 160) };
      const auth = await isAdmin();
      if (!auth.ok) return { ok: false, reason: "TEST_ADMIN_AUTHORIZATION_FAILED: " + String(auth.reason || "").slice(0, 160) };
      if (SUPABASE_URL !== "https://bgsbuepolooybdqrzmoa.supabase.co") {
        return { ok: false, reason: "ADMIN_CLIENT_NOT_POINTING_TO_TEST" };
      }

      await loadPricingControls();
      const body = document.getElementById("pricingBody");
      const row = Array.from(body?.querySelectorAll("tr") || []).find(tr =>
        tr.innerText.includes("ils-enquiry-fee-199")
      );
      if (!row) return { ok: false, reason: "ENQUIRY_PRICING_ROW_NOT_RENDERED", text: body?.innerText || "" };

      const price = row.querySelector(".pricingNewValue")?.value || "";
      const enabled = Boolean(row.querySelector(".pricingAdjustmentEnabled")?.checked);
      const credit = row.querySelector(".pricingAdjustmentAmount")?.value || "";
      return {
        ok: price === "299" && enabled && credit === "299",
        price, enabled, credit,
        feeCatalogueMessage: document.getElementById("professionalFeeBody")?.innerText || "",
        auditMessage: document.getElementById("pricingAuditBody")?.innerText || ""
      };
    }, {
      email: process.env.ILS_TEST_ADMIN_EMAIL,
      password: process.env.ILS_TEST_ADMIN_PASSWORD
    });

    if (!result.ok) throw new Error("LIVE TEST Admin pricing verification failed: " + JSON.stringify(result));
    if (restMutations.length) throw new Error("Unexpected Supabase REST mutation(s) during read-only test: " + JSON.stringify(restMutations));
    if (pageErrors.length) throw new Error("Browser page errors: " + pageErrors.join(" | "));

    console.log("ADMIN_PRICING_LIVE_TEST_ADMIN_AUTH=PASS");
    console.log("ADMIN_PRICING_LIVE_TEST_299_PRICE_AND_CREDIT=PASS");
    console.log("ADMIN_PRICING_LIVE_TEST_NO_REST_MUTATIONS=PASS");
    console.log("ADMIN_PRICING_LIVE_TEST_OPTIONAL_TABLE_STATUS=" +
      (result.feeCatalogueMessage.toLowerCase().includes("not configured") ? "EXPECTED_ABSENT" : "AVAILABLE"));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error("ADMIN_PRICING_LIVE_READONLY_FAILURE:", error && error.stack ? error.stack : error);
  process.exit(1);
});
