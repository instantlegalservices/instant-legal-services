"use strict";

const fs = require("fs");
const path = require("path");
const { writeComposedSitemap } = require("./sitemap-composer-writer");

const SITE_URL = "https://instantlegalservices.in";
const MANAGED_PREFIXES = [
  "/professional/ca/",
  "/professional/cs/"
];
const ROOTS = [
  path.join(process.cwd(), "professional", "ca"),
  path.join(process.cwd(), "professional", "cs")
];

function collectProfessionalRoutes(root) {
  const routes = [];
  if (!fs.existsSync(root)) return routes;

  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const indexPath = path.join(absolute, "index.html");
        if (fs.existsSync(indexPath)) {
          const relative = path.relative(process.cwd(), indexPath).split(path.sep).join("/");
          const route = relative.replace(/\/index\.html$/, "").replace(/^/, "/") + "/";
          routes.push(SITE_URL + route);
        }
        walk(absolute);
      }
    }
  }

  walk(root);
  return routes;
}

async function main() {
  const additionalUrls = [...new Set(ROOTS.flatMap(collectProfessionalRoutes))].sort();

  const result = await writeComposedSitemap({
    additionalUrls,
    managedPrefixes: MANAGED_PREFIXES
  });

  console.log("PROFESSIONAL_SITEMAP_SYNC=PASS");
  console.log("Professional URLs: " + additionalUrls.length);
  console.log("Final sitemap URLs: " + result.finalCount);
}

if (require.main === module) {
  main().catch(error => {
    console.error("PROFESSIONAL_SITEMAP_SYNC=FAIL");
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  SITE_URL,
  MANAGED_PREFIXES,
  collectProfessionalRoutes
};
