"use strict";
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
    reducedMotion: "reduce"
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));

  await page.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2", route =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
        window.__ilsQueries = [];
        window.supabase = {
          createClient: () => ({
            from: table => ({
              select: () => {
                const state = { table, filters: [] };
                const builder = {
                  eq: (key, value) => { state.filters.push([key, value]); return builder; },
                  or: value => { state.filters.push(["or", value]); return builder; },
                  ilike: (key, value) => { state.filters.push([key, value]); return builder; },
                  order: () => builder,
                  limit: async () => {
                    window.__ilsQueries.push(state);
                    const direct = state.filters.some(([key, value]) => key === "id" && value === "target-profile-123");
                    if (direct) return { data: [{
                      id: "target-profile-123",
                      advocate_name: "Direct Lookup Test Advocate",
                      practice_state: "Uttar Pradesh",
                      district_court: "Bareilly | District & Sessions Court",
                      primary_practice_area: "Criminal Law",
                      verification_status: "Verified"
                    }], error: null };
                    throw new Error("Simulated directory query failure");
                  }
                };
                return builder;
              }
            })
          })
        };
      `
    })
  );

  try {
    await page.goto((process.env.BASE_URL || "http://127.0.0.1:4173/") + "advocates.html?profile=target-profile-123", { waitUntil: "networkidle" });
    await page.locator("#profileModal.open").waitFor({ state: "attached", timeout: 10000 });
    const content = await page.locator("#profileContent").innerText();
    if (!content.includes("Direct Lookup Test Advocate")) throw new Error("Direct profile did not render");
    const directQueries = await page.evaluate(() => window.__ilsQueries.filter(q => q.filters.some(([key, value]) => key === "id" && value === "target-profile-123")).length);
    if (directQueries !== 1) throw new Error("Expected exactly one exact-ID query; got " + directQueries);
    if (errors.length) throw new Error("Browser errors: " + errors.join(" | "));
    console.log("ADVOCATE_DIRECT_PROFILE_E2E=PASS (direct lookup succeeds despite directory-list failure)");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
