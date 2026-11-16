"use strict";

const { chromium } = require("playwright");

const supabaseStub = `
window.__ilsMockCalls = [];
window.supabase = {
  createClient: function () {
    return {
      from: function (table) {
        const query = {
          select: function (columns) {
            if (table === "judgments") {
              window.__ilsMockCalls.push({ table: table, columns: String(columns) });
            }
            return this;
          },
          eq: function () { return this; },
          or: function () { return this; },
          ilike: function () { return this; },
          order: function () { return this; },
          limit: function () { return this; },
          then: function (resolve, reject) {
            const data = table === "judgments"
              ? [
                  {
                    id: "fixture-sci",
                    case_title: "Sample Constitutional Appeal",
                    case_number: "C.A. 101/2026",
                    court_name: "Supreme Court of India",
                    court_type: "Supreme Court",
                    judgment_date: "2026-10-10",
                    short_summary: "A sample verified judgment summary."
                  },
                  {
                    id: "fixture-hc",
                    case_title: "Sample Writ Petition",
                    case_number: "W.P. 202/2026",
                    court_name: "",
                    court_type: "Delhi High Court",
                    judgment_date: "2026-10-09",
                    short_summary: "A second sample judgment summary."
                  }
                ]
              : [];
            return Promise.resolve({ data: data, error: null }).then(resolve, reject);
          }
        };
        return query;
      }
    };
  }
};
`;

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
    await page.route(
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
      route => route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: supabaseStub
      })
    );

    await page.goto(process.env.BASE_URL || "http://127.0.0.1:4173/", {
      waitUntil: "domcontentloaded"
    });

    await page.waitForFunction(
      () => document.querySelectorAll("#judgments .dcard").length === 2,
      null,
      { timeout: 10000 }
    );

    const courtLabels = await page.locator("#judgments .dcard .meta span:first-child").allTextContents();
    if (courtLabels[0]?.trim() !== "Supreme Court of India") {
      throw new Error("court_name label did not render: " + JSON.stringify(courtLabels));
    }
    if (courtLabels[1]?.trim() !== "Delhi High Court") {
      throw new Error("court_type fallback did not render: " + JSON.stringify(courtLabels));
    }

    const cardTitles = await page.locator("#judgments .dcard h3").allTextContents();
    if (cardTitles[0]?.trim() !== "Sample Constitutional Appeal" ||
        cardTitles[1]?.trim() !== "Sample Writ Petition") {
      throw new Error("Judgment card titles did not render: " + JSON.stringify(cardTitles));
    }

    const query = await page.evaluate(() => window.__ilsMockCalls.find(call => call.table === "judgments"));
    if (!query || !/court_name/.test(query.columns) || !/court_type/.test(query.columns)) {
      throw new Error("Homepage judgment query omitted court label fields: " + JSON.stringify(query));
    }
    if (/detailed_summary|important_precedents|search_text/.test(query.columns)) {
      throw new Error("Homepage judgment query unexpectedly requested heavy detail fields.");
    }

    if (pageErrors.length) {
      throw new Error("Browser page errors: " + pageErrors.join(" | "));
    }

    console.log("HOME_JUDGMENT_COURT_NAME_RENDER=PASS");
    console.log("HOME_JUDGMENT_COURT_TYPE_FALLBACK=PASS");
    console.log("HOME_JUDGMENT_COMPACT_QUERY=PASS");
    console.log("HOME_JUDGMENT_CARD_RENDER_E2E=PASS (2 fixtures)");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
