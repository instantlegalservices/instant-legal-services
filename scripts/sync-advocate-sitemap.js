"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  parseSitemap,
  renderSitemap,
  validateComposedSitemap,
  SITE_URL
} = require("./sitemap-composer");

const SITEMAP_PATH = path.join(process.cwd(), "sitemap.xml");
const MANAGED_PREFIX = "/advocate/";

function collectAdvocateRoutes(root = process.cwd()) {
  const manifestPath = path.join(root, ".generated-advocate-routes.json");
  if (!fs.existsSync(manifestPath)) return [];

  const parsed = JSON.parse(
    fs.readFileSync(manifestPath, "utf8")
  );

  if (!Array.isArray(parsed.routes)) {
    throw new Error("Invalid advocate SEO ownership manifest.");
  }

  return [...new Set(
    parsed.routes.filter(
      route =>
        typeof route === "string" &&
        route.startsWith("advocate/") &&
        route.endsWith("/")
    )
  )].sort();
}

function toAbsolute(route) {
  return `${SITE_URL}${route}`;
}

function assertManagedRoute(route) {
  if (!route.startsWith(MANAGED_PREFIX) || !route.endsWith("/")) {
    throw new Error(`Invalid advocate route: ${route}`);
  }
  return toAbsolute(route);
}

function main() {
  const existing = fs.readFileSync(SITEMAP_PATH, "utf8");
  const currentRoutes = collectAdvocateRoutes();
  const currentUrls = new Set(currentRoutes.map(assertManagedRoute));

  const entries = parseSitemap(existing)
    .filter(entry => !new URL(entry.loc).pathname.startsWith(MANAGED_PREFIX));

  for (const loc of currentUrls) entries.push({ loc });

  const byUrl = new Map(entries.map(entry => [entry.loc, entry]));
  const finalEntries = [...byUrl.values()].sort((a,b) => a.loc.localeCompare(b.loc));
  const finalXml = renderSitemap(finalEntries);
  validateComposedSitemap(finalXml);

  const temp = path.join(
    path.dirname(SITEMAP_PATH),
    `.sitemap.xml.${process.pid}.${Date.now()}.tmp`
  );
  fs.writeFileSync(temp, finalXml, "utf8");
  fs.renameSync(temp, SITEMAP_PATH);

  console.log(`PASS: synced ${currentUrls.size} advocate routes; final sitemap URLs: ${finalEntries.length}`);
}

if (require.main === module) main();

module.exports = { collectAdvocateRoutes, MANAGED_PREFIX };