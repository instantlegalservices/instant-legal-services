#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("PASS:", msg);
  }
}

function parseRobots(text) {
  const rules = [];
  let inStar = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === "user-agent") {
      inStar = value === "*";
    } else if (inStar && (field === "allow" || field === "disallow")) {
      rules.push({ type: field, path: value });
    }
  }
  return rules;
}

function isAllowed(rules, urlPath) {
  let best = { len: -1, allowed: true };
  for (const rule of rules) {
    if (!rule.path) continue;
    if (!urlPath.startsWith(rule.path) && rule.path !== "/") continue;
    if (rule.path.length > best.len) {
      best = { len: rule.path.length, allowed: rule.type === "allow" };
    }
  }
  return best.allowed;
}

function headSnippet(file, bytes = 2500) {
  const abs = path.join(ROOT, file);
  const buf = fs.readFileSync(abs);
  return buf.slice(0, bytes).toString("utf8");
}

function metaRobots(html) {
  const m = html.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i)
    || html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']robots["']/i);
  return m ? m[1].toLowerCase().replace(/\s+/g, "") : null;
}

function canonical(html) {
  const m = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)
    || html.match(/<link\s+href=["']([^"']+)["']\s+rel=["']canonical["']/i);
  return m ? m[1] : null;
}

function isNoindex(value) {
  return !!value && value.split(",").includes("noindex");
}

function isIndexFollow(value) {
  if (!value) return false;
  const parts = value.split(",");
  return parts.includes("index") && !parts.includes("noindex");
}

const robotsText = fs.readFileSync(path.join(ROOT, "robots.txt"), "utf8");
const rules = parseRobots(robotsText);

console.log("robots rules:", rules);

const privatePaths = [
  "/portal.html",
  "/admin.html",
  "/admin/",
  "/admin/index.html",
  "/legacy-admin.html",
  "/ils-test-operator-bootstrap.html",
  "/ils-test-synthetic-provision.html",
  "/ils-test-future-page.html",
  "/supabase/",
  "/supabase/hardened_rls.sql"
];

const publicPaths = [
  "/",
  "/index.html",
  "/legal-search.html",
  "/judgments.html",
  "/judgment.html",
  "/law-guide.html",
  "/advocates.html",
  "/advocate/alok-kumar-sharma/",
  "/practice/civil-law/",
  "/practice/criminal-law/",
  "/government/",
  "/government/ecourts-case-status/",
  "/state/delhi/",
  "/district/bareilly/",
  "/court/high-court/",
  "/sections/bns-115.html",
  "/acts/bns-2023.html",
  "/about.html",
  "/faq.html",
  "/assistance.html",
  "/tools.html",
  "/ai-assistant.html",
  "/advocate-register.html"
];

for (const p of privatePaths) {
  assert(!isAllowed(rules, p), `robots blocks ${p}`);
}
for (const p of publicPaths) {
  assert(isAllowed(rules, p), `robots allows ${p}`);
}

assert(!/Disallow:\s*\/practice/i.test(robotsText), "no broad /practice disallow");
assert(!/Disallow:\s*\/advocate/i.test(robotsText), "no broad /advocate disallow");
assert(!/Disallow:\s*\/government/i.test(robotsText), "no broad /government disallow");
assert(!/Disallow:\s*\/state/i.test(robotsText), "no broad /state disallow");
assert(!/Disallow:\s*\/district/i.test(robotsText), "no broad /district disallow");
assert(!/Disallow:\s*\/court/i.test(robotsText), "no broad /court disallow");
assert(!/Disallow:\s*\/$/m.test(robotsText), "root is not disallowed");

const privatePages = [
  ["portal.html", "https://instantlegalservices.in/portal.html"],
  ["legacy-admin.html", "https://instantlegalservices.in/legacy-admin.html"],
  ["admin.html", "https://instantlegalservices.in/admin.html"],
  ["admin/index.html", "https://instantlegalservices.in/admin/"],
  ["ils-test-operator-bootstrap.html", "https://instantlegalservices.in/ils-test-operator-bootstrap.html"],
  ["ils-test-synthetic-provision.html", "https://instantlegalservices.in/ils-test-synthetic-provision.html"],
  ["ils-test-customer-action-e2e.html", "https://instantlegalservices.in/ils-test-customer-action-e2e.html"],
  ["ils-test-customer-action-e2e-proof-run.html", "https://instantlegalservices.in/ils-test-customer-action-e2e-proof-run.html"]
];

for (const [file, expectedCanon] of privatePages) {
  const html = headSnippet(file);
  const robots = metaRobots(html);
  const canon = canonical(html);
  assert(isNoindex(robots), `${file} meta robots noindex (${robots})`);
  assert(canon === expectedCanon, `${file} canonical is ${canon}`);
  assert(canon !== "/" && canon !== "https://instantlegalservices.in/", `${file} does not canonical to homepage`);
}

const publicPages = [
  ["index.html", "https://instantlegalservices.in/"],
  ["judgments.html", "https://instantlegalservices.in/judgments.html"],
  ["legal-search.html", "https://instantlegalservices.in/legal-search.html"],
  ["government/index.html", "https://instantlegalservices.in/government/"],
  ["practice/civil-law/index.html", "https://instantlegalservices.in/practice/civil-law/"],
  ["advocate/alok-kumar-sharma/index.html", "https://instantlegalservices.in/advocate/alok-kumar-sharma/"]
];

for (const [file, expectedCanon] of publicPages) {
  const html = headSnippet(file);
  const robots = metaRobots(html);
  const canon = canonical(html);
  assert(isIndexFollow(robots), `${file} remains indexable (${robots})`);
  assert(canon === expectedCanon, `${file} canonical unchanged (${canon})`);
}

const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"));
const sitemapHash = crypto.createHash("sha256").update(sitemap).digest("hex");
console.log("sitemap sha256:", sitemapHash);
assert(!/portal\.html|admin\.html|legacy-admin|ils-test-/i.test(sitemap.toString("utf8")), "sitemap has no private/test URLs");

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll Gate 1 indexability tests passed");
