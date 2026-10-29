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
  const failures = [];
  page.on("pageerror", e => failures.push("pageerror: " + e.message));
  page.on("console", m => {
    if (m.type() === "error" && !m.text().includes("ILS Service Worker Error")) {
      failures.push("console: " + m.text());
    }
  });

  try {
    await page.goto(process.env.BASE_URL || "http://127.0.0.1:4173/", { waitUntil: "networkidle" });
    const language = page.locator("#language");
    if (await language.count()) await language.selectOption("en-IN");

    const cases = [
      { query: "Chalan bharwana hai", expected: "Traffic / eChallan" },
      { query: "challan payment", expected: "Traffic / eChallan" },
      { query: "e-chalan status", expected: "Traffic / eChallan" }
    ];

    for (const item of cases) {
      await page.locator("#problem").fill(item.query);
      await page.locator("#understand").click();
      await page.locator("#modal").waitFor({ state: "visible" });
      const result = await page.locator("#result").innerText();
      if (!result.includes(item.expected)) {
        throw new Error('Query "' + item.query + '" expected route "' + item.expected + '"; actual result: ' + result.slice(0, 800));
      }
      const officialLink = page.locator('#result a[href="https://echallan.parivahan.gov.in/index/accused-challan"]');
      if (await officialLink.count() < 1) {
        throw new Error('Official eChallan link missing for query "' + item.query + '"');
      }
      await page.locator("#close").click();
      await page.locator("#modal").waitFor({ state: "hidden" });
    }

    if (failures.length) throw new Error("Browser errors: " + failures.join(" | "));
    console.log("HOME_SEARCH_ROUTING_E2E=PASS (" + cases.length + " cases)");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
