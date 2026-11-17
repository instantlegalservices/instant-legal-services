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
      { query: "e-chalan status", expected: "Traffic / eChallan" },
      { query: "UP Labour Department", expected: "UP Labour Department", official: "https://uplabour.gov.in/" },
      { query: "labour registration UP", expected: "UP Labour Department", official: "https://uplabour.gov.in/" },
      { query: "unpaid wages claim", expected: "SAMADHAN Labour Disputes", official: "https://samadhan.labour.gov.in/" },
      { query: "industrial dispute", expected: "SAMADHAN Labour Disputes", official: "https://samadhan.labour.gov.in/" },
      { query: "labour court lawyer", expected: "Labour & Employment Legal Assistance", official: "https://instantlegalservices.in/practice/labour-and-employment-law/" }
    ];

    for (const item of cases) {
      await page.locator("#problem").fill(item.query);
      await page.locator("#understand").click();
      await page.locator("#modal").waitFor({ state: "visible" });
      const result = await page.locator("#result").innerText();
      if (!result.includes(item.expected)) {
        throw new Error('Query "' + item.query + '" expected route "' + item.expected + '"; actual result: ' + result.slice(0, 800));
      }
      const expectedOfficial = item.official || "https://echallan.parivahan.gov.in/index/accused-challan";
      const officialLink = page.locator('#result a[href="' + expectedOfficial + '"]');
      if (await officialLink.count() < 1) {
        throw new Error('Official link "' + expectedOfficial + '" missing for query "' + item.query + '"');
      }
      await page.locator("#close").click();
      await page.locator("#modal").waitFor({ state: "hidden" });
    }

    const baseUrl = process.env.BASE_URL || "http://127.0.0.1:4173/";
    const routePages = [
      { path: "government/up-labour-department/", title: "UP Labour Department", official: "https://uplabour.gov.in/" },
      { path: "government/samadhan-labour-disputes/", title: "SAMADHAN Labour Disputes", official: "https://samadhan.labour.gov.in/" }
    ];
    for (const route of routePages) {
      await page.goto(new URL(route.path, baseUrl).toString(), { waitUntil: "networkidle" });
      if (!(await page.locator("h1").innerText()).includes(route.title)) {
        throw new Error("Government route page heading mismatch: " + route.path);
      }
      const canonical = "https://instantlegalservices.in/" + route.path;
      if (await page.locator('link[rel="canonical"][href="' + canonical + '"]').count() !== 1) {
        throw new Error("Canonical URL missing or duplicated: " + route.path);
      }
      if (await page.locator('a[href="' + route.official + '"]').count() < 1) {
        throw new Error("Official portal link missing: " + route.path);
      }
    }

    if (failures.length) throw new Error("Browser errors: " + failures.join(" | "));
    console.log("HOME_SEARCH_ROUTING_E2E=PASS (" + cases.length + " queries; " + routePages.length + " government pages)");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
