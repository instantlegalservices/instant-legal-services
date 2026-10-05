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

function collectAdvocateRoutes(root = path.join(process.cwd(), "advocate")) {
  if (!fs.existsSync(root)) return [];
  const routes = [];
  function walk(dir, relative) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = relative ? path.join(relative, entry.name) : entry.name;
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.isFile() && entry.name === "index.html") {
        const route = "/advocate/" + rel.slice(0, -"/index.html".length).replace(/\\/g, "/") + "/";
        routes.push(route);
      }
    }
  }
  walk(root, "");
  return [...new Set(routes)].sort();
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