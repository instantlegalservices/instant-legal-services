"use strict";

const fs = require("fs");
const assert = require("node:assert/strict");

const generator = fs.readFileSync("scripts/generate-seo-pages.js", "utf8");
const homepage = fs.readFileSync("index.html", "utf8");
const navigator = fs.readFileSync("government/index.html", "utf8");
const sitemap = fs.readFileSync("sitemap.xml", "utf8");

const routes = [
  {
    slug: "up-labour-department",
    title: "UP Labour Department",
    official: "https://uplabour.gov.in/"
  },
  {
    slug: "samadhan-labour-disputes",
    title: "SAMADHAN Labour Disputes",
    official: "https://samadhan.labour.gov.in/"
  }
];

for (const route of routes) {
  const path = `government/${route.slug}/index.html`;
  const page = fs.readFileSync(path, "utf8");
  const canonical = `https://instantlegalservices.in/government/${route.slug}/`;

  assert.ok(generator.includes(`slug: "${route.slug}"`), `generator must register ${route.slug}`);
  assert.ok(generator.includes(route.official), `generator must use the verified official URL for ${route.slug}`);
  assert.ok(page.includes(`<link\\n  rel="canonical"\\n  href="${canonical}"`), `canonical missing for ${route.slug}`);
  assert.ok(page.includes(route.official), `official URL missing for ${route.slug}`);
  assert.ok(page.includes(`<title>${route.title} | Official Government Route | Instant Legal Services</title>`));
  assert.ok(page.includes("What this portal is for"), `scope guidance missing for ${route.slug}`);
  assert.ok(page.includes("Never share OTPs") || page.includes("Do not share OTPs"), `safety guidance missing for ${route.slug}`);
  assert.equal((sitemap.match(new RegExp(canonical.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&"), "g")) || []).length, 1, `sitemap must contain exactly one ${route.slug} URL`);
  assert.ok(navigator.includes(canonical), `navigator card missing for ${route.slug}`);
}

const labourContext = homepage.indexOf('"up-labour-department": {');
const samadhanContext = homepage.indexOf('"samadhan-labour-disputes": {');
assert.ok(labourContext >= 0 && samadhanContext >= 0, "both routes must be available to the homepage route context");

const samadhanRule = homepage.indexOf('title:"SAMADHAN Labour Disputes"');
const labourRule = homepage.indexOf('title:"UP Labour Department"');
assert.ok(samadhanRule >= 0 && labourRule > samadhanRule, "specific SAMADHAN claims must be classified before generic labour queries");

for (const locale of ["hi-IN", "en-IN", "hinglish", "ur-IN", "bn-IN"]) {
  const localeStart = homepage.indexOf(`  "${locale}":{`);
  assert.ok(localeStart >= 0, `missing locale ${locale}`);
  const nextLocale = homepage.indexOf('\n  "', localeStart + 4);
  const block = homepage.slice(localeStart, nextLocale < 0 ? homepage.length : nextLocale);
  assert.ok(block.includes('"UP Labour Department":['), `UP Labour translation missing for ${locale}`);
  assert.ok(block.includes('"SAMADHAN Labour Disputes":['), `SAMADHAN translation missing for ${locale}`);
}

console.log("PASS: UP Labour and SAMADHAN routes, official URLs, localized labels, SEO canonicals, navigator cards and sitemap entries are consistent.");
