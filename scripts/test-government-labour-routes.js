"use strict";
const fs = require("fs");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const generator = fs.readFileSync("scripts/generate-seo-pages.js", "utf8");
const homepage = fs.readFileSync("index.html", "utf8");
const navigator = fs.readFileSync("government/index.html", "utf8");
const sitemap = fs.readFileSync("sitemap.xml", "utf8");

let compiledInlineScripts = 0;
let scriptCursor = 0;
while (true) {
  const open = homepage.indexOf("<script", scriptCursor);
  if (open < 0) break;
  const openEnd = homepage.indexOf(">", open);
  if (openEnd < 0) break;
  const close = homepage.indexOf("</script>", openEnd + 1);
  if (close < 0) break;
  const attributes = homepage.slice(open + 7, openEnd);
  const source = homepage.slice(openEnd + 1, close);
  if (!attributes.includes("src=") && !attributes.includes('type="application/ld+json"') && source.trim()) {
    new vm.Script(source, { filename: "index.html inline script " + (compiledInlineScripts + 1) });
    compiledInlineScripts++;
  }
  scriptCursor = close + 9;
}
assert.ok(compiledInlineScripts > 0, "homepage inline JavaScript should be syntax-checked");


const routes = [
  { slug: "up-labour-department", title: "UP Labour Department", official: "https://uplabour.gov.in/" },
  { slug: "samadhan-labour-disputes", title: "SAMADHAN 2.0 Labour Disputes", official: "https://samadhan.labour.gov.in/", manual: "https://samadhan.labour.gov.in/documents/User_Manual_Applicants.pdf", frameworkSource: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2192463", portalVersionSource: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2285769" }
];

for (const route of routes) {
  const page = fs.readFileSync("government/" + route.slug + "/index.html", "utf8");
  const canonical = "https://instantlegalservices.in/government/" + route.slug + "/";
  assert.ok(generator.includes('slug: "' + route.slug + '"'), "generator route missing: " + route.slug);
  assert.ok(generator.includes(route.official), "generator official URL missing: " + route.slug);
  assert.ok(page.includes('href="' + canonical + '"'), "canonical missing: " + route.slug);
  assert.ok(page.includes(route.official), "official link missing: " + route.slug);
  assert.ok(page.includes("<title>" + route.title + " | Official Government Route | Instant Legal Services</title>"));
  assert.ok(page.includes("What this portal is for"), "scope guidance missing: " + route.slug);
  assert.ok(page.includes("Do not share OTPs"), "safety guidance missing: " + route.slug);
  if (route.slug === "samadhan-labour-disputes") {
    assert.ok(page.includes("SAMADHAN 2.0"), "current portal identity missing");
    assert.ok(page.includes("21 November 2025"), "current Labour Codes effective date missing");
    assert.ok(page.includes(route.manual), "applicant manual link missing");
    assert.ok(page.includes(route.frameworkSource), "official Labour Codes source missing");
    assert.ok(page.includes(route.portalVersionSource), "official SAMADHAN Portal 2.0 source missing");
    assert.ok(generator.includes(route.portalVersionSource), "SEO generator must preserve official SAMADHAN Portal 2.0 source");
    assert.ok(!page.includes("minimum wages, gratuity and maternity benefits"), "legacy claim list must not be represented as current filing scope");
    assert.ok(generator.includes("SAMADHAN 2.0"), "generator must preserve current portal identity");
  }
  assert.equal(sitemap.split(canonical).length - 1, 1, "sitemap must contain exactly one canonical URL: " + route.slug);
  assert.ok(navigator.includes(canonical), "navigator card missing: " + route.slug);
}

assert.ok(homepage.includes('"up-labour-department": {'), "UP Labour route context missing");
assert.ok(homepage.includes('"samadhan-labour-disputes": {'), "SAMADHAN route context missing");
const legalAssistanceRule = homepage.indexOf('keys:["labour lawyer"');
const samadhanRule = homepage.indexOf('keys:["samadhan labour"');
const labourRule = homepage.indexOf('keys:["up labour"');
assert.ok(legalAssistanceRule >= 0 && samadhanRule > legalAssistanceRule && labourRule > samadhanRule, "specific legal-assistance and SAMADHAN claims must be classified before generic labour queries");
const genericLabourRule = homepage.slice(labourRule, homepage.indexOf('title:"UP Labour Department"', labourRule));
for (const ambiguous of ['"labour complaint"', '"labour grievance"', '"श्रम"', '"श्रमिक शिकायत"', '"मजदूर शिकायत"', '"कर्मचारी शिकायत"']) {
  assert.ok(!genericLabourRule.includes(ambiguous), "ambiguous labour query must not be forced to the UP government portal: " + ambiguous);
}

assert.ok(homepage.includes("const explicitLabourIntent=["), "labour ambiguity guard must exist before generic government-grievance routing");
assert.ok(homepage.includes("if(isLabourQuery&&!explicitLabourIntent.some(term=>n.includes(term)))"), "generic labour complaints must request clarification before generic government routing");

const routeMapStart = homepage.indexOf("const routeMap=");
for (const locale of ["hi-IN", "en-IN", "hinglish", "ur-IN", "bn-IN"]) {
  const localeStart = homepage.indexOf('  "' + locale + '":{', routeMapStart);
  assert.ok(localeStart >= 0, "missing route-map locale: " + locale);
  const nextLocale = homepage.indexOf('\n  "', localeStart + 4);
  const block = homepage.slice(localeStart, nextLocale < 0 ? homepage.length : nextLocale);
  assert.ok(block.includes('"UP Labour Department":['), "UP Labour translation missing: " + locale);
  assert.ok(block.includes('"SAMADHAN Labour Disputes":['), "SAMADHAN translation missing: " + locale);
  assert.ok(block.includes('"Labour & Employment Legal Assistance":['), "labour legal-assistance translation missing: " + locale);
}

console.log("PASS: labour route registry, query routing, localized labels, SEO canonicals, navigator cards and sitemap entries.");
