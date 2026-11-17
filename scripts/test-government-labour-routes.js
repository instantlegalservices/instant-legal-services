"use strict";
const fs = require("fs");
const assert = require("node:assert/strict");

const generator = fs.readFileSync("scripts/generate-seo-pages.js", "utf8");
const homepage = fs.readFileSync("index.html", "utf8");
const navigator = fs.readFileSync("government/index.html", "utf8");
const sitemap = fs.readFileSync("sitemap.xml", "utf8");

const routes = [
  { slug: "up-labour-department", title: "UP Labour Department", official: "https://uplabour.gov.in/" },
  { slug: "samadhan-labour-disputes", title: "SAMADHAN Labour Disputes", official: "https://samadhan.labour.gov.in/" }
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
  assert.equal(sitemap.split(canonical).length - 1, 1, "sitemap must contain exactly one canonical URL: " + route.slug);
  assert.ok(navigator.includes(canonical), "navigator card missing: " + route.slug);
}

assert.ok(homepage.includes('"up-labour-department": {'), "UP Labour route context missing");
assert.ok(homepage.includes('"samadhan-labour-disputes": {'), "SAMADHAN route context missing");
const samadhanRule = homepage.indexOf('keys:["samadhan labour"');
const labourRule = homepage.indexOf('keys:["up labour"');
assert.ok(samadhanRule >= 0 && labourRule > samadhanRule, "specific SAMADHAN claims must be classified before generic labour queries");

for (const locale of ["hi-IN", "en-IN", "hinglish", "ur-IN", "bn-IN"]) {
  const localeStart = homepage.indexOf('  "' + locale + '":{');
  assert.ok(localeStart >= 0, "missing locale: " + locale);
  const nextLocale = homepage.indexOf('\n  "', localeStart + 4);
  const block = homepage.slice(localeStart, nextLocale < 0 ? homepage.length : nextLocale);
  assert.ok(block.includes('"UP Labour Department":['), "UP Labour translation missing: " + locale);
  assert.ok(block.includes('"SAMADHAN Labour Disputes":['), "SAMADHAN translation missing: " + locale);
}

console.log("PASS: labour route registry, query routing, localized labels, SEO canonicals, navigator cards and sitemap entries.");
