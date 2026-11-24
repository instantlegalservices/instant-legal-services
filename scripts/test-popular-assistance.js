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
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  try {
    await page.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2", route => route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "window.supabase={createClient:function(){return {};}};"
    }));

    const base = (process.env.BASE_URL || "http://127.0.0.1:4173/").replace(/\/$/, "");
    await page.goto(base + "/");

    const cards = page.locator("#popular-assistance .popular-card");
    if (await cards.count() !== 4) throw new Error("Expected four Popular Assistance cards.");

    const legalHref = await page.locator("#popular-assistance .popular-card.legal").getAttribute("href");
    const recoveryHref = await page.locator("#popular-assistance .popular-card.recovery").getAttribute("href");
    if (legalHref !== "assistance.html?service=legal-drafting") throw new Error("Legal Drafting card route mismatch: " + legalHref);
    if (recoveryHref !== "assistance.html?service=money-recovery") throw new Error("Money Recovery card route mismatch: " + recoveryHref);

    await page.goto(base + "/assistance.html?service=legal-drafting");
    if (await page.locator("#standardHelp h1").innerText() !== "Legal Drafting Assistance") {
      throw new Error("Legal Drafting heading did not prefill.");
    }
    if (!(await page.locator("#brief").inputValue()).includes("legal drafting assistance")) {
      throw new Error("Legal Drafting brief did not prefill.");
    }

    await page.goto(base + "/assistance.html?service=money-recovery");
    if (await page.locator("#standardHelp h1").innerText() !== "Money Recovery Assistance") {
      throw new Error("Money Recovery heading did not prefill.");
    }
    if (!(await page.locator("#brief").inputValue()).includes("recovery of an outstanding amount")) {
      throw new Error("Money Recovery brief did not prefill.");
    }

    await page.goto(base + "/assistance.html?mode=guided&service=legal-drafting&problem=Traffic%20challan&route=Traffic%20Challan");
    if (!(await page.locator("#routeMode").isVisible())) throw new Error("Existing guided mode was not preserved.");
    if (await page.locator("#standardFormSection").isVisible()) throw new Error("Service prefill incorrectly overrode guided mode.");

    if (pageErrors.length) throw new Error("Browser page errors: " + pageErrors.join(" | "));
    console.log("POPULAR_ASSISTANCE_CARD_ROUTES=PASS (4 cards)");
    console.log("LEGAL_DRAFTING_INTAKE_PREFILL=PASS");
    console.log("MONEY_RECOVERY_INTAKE_PREFILL=PASS");
    console.log("GUIDED_MODE_COMPATIBILITY=PASS");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
