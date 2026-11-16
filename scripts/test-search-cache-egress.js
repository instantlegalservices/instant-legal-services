"use strict";
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));

  const fakeCore = `
    window.__calls = { advocates: [], judgments: [] };
    window.ILS = {
      esc: v => String(v ?? ""),
      split: v => v ? String(v).split(",") : [],
      formatDate: v => String(v || ""),
      sectionLinksHTML: () => "",
      searchIntentHTML: () => "",
      profileHTML: () => "",
      advocates: async o => { window.__calls.advocates.push({...o}); return []; },
      judgments: async o => { window.__calls.judgments.push({...o}); return []; }
    };
  `;
  await page.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2", r => r.fulfill({ contentType: "application/javascript", body: "" }));
  await page.route("**/assets/ils-core.js", r => r.fulfill({ contentType: "application/javascript", body: fakeCore }));

  try {
    for (const spec of [
      { path: "judgments.html", input: "#jq", key: "judgments" },
      { path: "advocates.html", input: "#aq", key: "advocates" }
    ]) {
      await page.goto("http://127.0.0.1:4173/" + spec.path, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(key => window.__calls && window.__calls[key].length === 1, spec.key);
      await page.locator(spec.input).fill("a");
      await page.locator(spec.input).fill("ab");
      await page.locator(spec.input).fill("final search");
      await page.waitForTimeout(180);
      const beforeDelay = await page.evaluate(key => window.__calls[key].length, spec.key);
      if (beforeDelay !== 1) throw new Error(spec.path + ": search fired before 350ms debounce");
      await page.waitForFunction(key => window.__calls[key].length === 2, spec.key, { timeout: 3000 });
      const calls = await page.evaluate(key => window.__calls[key], spec.key);
      if (calls.length !== 2 || calls[1].q !== "final search") throw new Error(spec.path + ": expected one debounced request with final query");
      console.log(spec.path.toUpperCase() + "_DEBOUNCE=PASS");
    }

    await page.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      window.ILS = {
        advocates: async () => { window.__baseAdv = (window.__baseAdv || 0) + 1; return Array.from({length: 12}, (_,i)=>({id:i})); },
        judgments: async () => { window.__baseJud = (window.__baseJud || 0) + 1; return Array.from({length: 12}, (_,i)=>({id:i})); }
      };
    });
    await page.addScriptTag({ url: "http://127.0.0.1:4173/assets/pwa.js" });
    await page.waitForFunction(() => window.ILS.advocates.__homeRotationWrapped && window.ILS.judgments.__homeRotationWrapped);
    await page.evaluate(async () => {
      await window.ILS.advocates({limit:4,featured:true});
      await window.ILS.advocates({limit:4,featured:true});
      await window.ILS.judgments({limit:4});
      await window.ILS.judgments({limit:4});
    });
    const counts = await page.evaluate(() => ({adv:window.__baseAdv,jud:window.__baseJud}));
    if (counts.adv !== 1 || counts.jud !== 1) throw new Error("Homepage pools were not cached: " + JSON.stringify(counts));
    let navigations = 0;
    page.on("framenavigated", frame => { if (frame === page.mainFrame()) navigations++; });
    await page.waitForTimeout(1200);
    if (navigations !== 0) throw new Error("Unexpected periodic page navigation/reload");
    if (errors.length) throw new Error("Browser errors: " + errors.join(" | "));
    console.log("HOMEPAGE_POOL_CACHE=PASS; NO_PERIODIC_RELOAD=PASS");
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e.stack || e); process.exit(1); });
