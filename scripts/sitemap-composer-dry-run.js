/**
 * Instant Legal Services
 * Sitemap Composer Production Dry-Run Auditor
 *
 * Purpose:
 * - Read the existing root sitemap.xml.
 * - Load the validated Location Registry feeds.
 * - Compose the prospective sitemap entirely in memory.
 * - Validate the prospective sitemap.
 * - Report exact before/after SHA-256 hashes.
 * - Report URL inventory changes.
 *
 * HARD SAFETY CONTRACT:
 * - No filesystem writes.
 * - No rename.
 * - No temporary file.
 * - No database writes.
 * - No Git writes.
 * - Does NOT import sitemap-composer-writer.js.
 * - Existing sitemap.xml must remain byte-for-byte unchanged.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  loadLocationFeeds
} = require("./location-registry-feed");

const {
  parseSitemap,
  composeSitemap,
  validateComposedSitemap,
  getUtf8ByteLength
} = require("./sitemap-composer");

const DEFAULT_SITEMAP_PATH =
  path.join(
    process.cwd(),
    "sitemap.xml"
  );

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function assertSitemapPath(sitemapPath) {
  if (
    typeof sitemapPath !== "string" ||
    !sitemapPath.trim()
  ) {
    throw new Error(
      "sitemapPath must be a non-empty string"
    );
  }

  const resolved =
    path.resolve(sitemapPath);

  if (
    path.basename(resolved) !==
    "sitemap.xml"
  ) {
    throw new Error(
      `sitemapPath must target sitemap.xml: ${resolved}`
    );
  }

  return resolved;
}

async function assertNotSymlink(filePath) {
  const stat =
    await fs.promises.lstat(
      filePath
    );

  if (stat.isSymbolicLink()) {
    throw new Error(
      `sitemap.xml must not be a symbolic link: ${filePath}`
    );
  }
}

async function readSitemap(sitemapPath) {
  await assertNotSymlink(
    sitemapPath
  );

  const xml =
    await fs.promises.readFile(
      sitemapPath,
      "utf8"
    );

  if (!xml.trim()) {
    throw new Error(
      "sitemap.xml is empty"
    );
  }

  return xml;
}

function buildUrlSet(entries) {
  return new Set(
    entries.map(
      entry => entry.loc
    )
  );
}

function calculateInventory(
  existingXml,
  composedXml,
  result,
  currentRows,
  redirectRows
) {
  const existingEntries =
    parseSitemap(existingXml);

  const composedEntries =
    parseSitemap(composedXml);

  const existingUrls =
    buildUrlSet(existingEntries);

  const composedUrls =
    buildUrlSet(composedEntries);

  const addedUrls =
    Array.from(composedUrls)
      .filter(
        url =>
          !existingUrls.has(url)
      )
      .sort();

  const removedUrls =
    Array.from(existingUrls)
      .filter(
        url =>
          !composedUrls.has(url)
      )
      .sort();

  const historicalUrls =
    new Set(
      redirectRows.map(
        row =>
          `https://instantlegalservices.in${row.route}`
      )
    );

  const historicalStillPresent =
    Array.from(historicalUrls)
      .filter(
        url =>
          composedUrls.has(url)
      )
      .sort();

  const currentUrls =
    new Set(
      currentRows.map(
        row =>
          `https://instantlegalservices.in${row.current_route}`
      )
    );

  const currentMissing =
    Array.from(currentUrls)
      .filter(
        url =>
          !composedUrls.has(url)
      )
      .sort();

  return {
    existingCount:
      existingEntries.length,

    composedCount:
      composedEntries.length,

    addedUrls,

    removedUrls,

    historicalRoutesConfigured:
      historicalUrls.size,

    historicalStillPresent,

    currentRoutesConfigured:
      currentUrls.size,

    currentMissing,

    historicalRoutesExcluded:
      result.historicalRoutesExcluded,

    duplicateCurrentRoutesReplaced:
      result.duplicateCurrentRoutesReplaced,

    currentLocationCount:
      result.currentLocationCount,

    finalCount:
      result.finalCount
  };
}

/**
 * Perform the complete dry-run.
 *
 * IMPORTANT:
 * This function deliberately does NOT import or
 * call writeComposedSitemap().
 */
async function auditComposedSitemap(
  options = {}
) {
  const sitemapPath =
    assertSitemapPath(
      options.sitemapPath ||
      DEFAULT_SITEMAP_PATH
    );

  const loadFeedsFn =
    options.loadFeedsFn ||
    loadLocationFeeds;

  if (
    typeof loadFeedsFn !==
    "function"
  ) {
    throw new Error(
      "loadFeedsFn must be a function"
    );
  }

  /*
   * Read original sitemap.
   */
  const existingXml =
    await readSitemap(
      sitemapPath
    );

  const originalSha256 =
    sha256(existingXml);

  const originalBytes =
    getUtf8ByteLength(
      existingXml
    );

  /*
   * Load Registry data.
   *
   * Registry loader itself performs
   * feed validation.
   */
  const feeds =
    await loadFeedsFn();

  if (
    !feeds ||
    typeof feeds !== "object" ||
    Array.isArray(feeds)
  ) {
    throw new Error(
      "Location Registry loader returned an invalid result"
    );
  }

  if (
    !Array.isArray(
      feeds.currentRows
    )
  ) {
    throw new Error(
      "Registry feed missing currentRows"
    );
  }

  if (
    !Array.isArray(
      feeds.redirectRows
    )
  ) {
    throw new Error(
      "Registry feed missing redirectRows"
    );
  }

  /*
   * Pure in-memory composition.
   */
  const result =
    composeSitemap(
      existingXml,
      feeds.currentRows,
      feeds.redirectRows
    );

  if (
    !result ||
    typeof result !== "object"
  ) {
    throw new Error(
      "Composer returned an invalid result"
    );
  }

  const composedXml =
    result.xml;

  if (
    typeof composedXml !==
      "string" ||
    !composedXml
  ) {
    throw new Error(
      "Composer returned empty XML"
    );
  }

  /*
   * Independent final validation.
   */
  validateComposedSitemap(
    composedXml
  );

  const composedSha256 =
    sha256(composedXml);

  const composedBytes =
    getUtf8ByteLength(
      composedXml
    );

  const inventory =
    calculateInventory(
      existingXml,
      composedXml,
      result,
      feeds.currentRows,
      feeds.redirectRows
    );

  /*
   * CRITICAL SAFETY CHECK:
   *
   * Re-read sitemap.xml AFTER the complete
   * audit. The dry-run must leave it
   * byte-for-byte unchanged.
   */
  const afterXml =
    await readSitemap(
      sitemapPath
    );

  const afterSha256 =
    sha256(afterXml);

  if (
    afterXml !==
    existingXml
  ) {
    throw new Error(
      "DRY-RUN SAFETY FAILURE: sitemap.xml changed during audit"
    );
  }

  if (
    afterSha256 !==
    originalSha256
  ) {
    throw new Error(
      "DRY-RUN SAFETY FAILURE: sitemap.xml SHA-256 changed during audit"
    );
  }

  /*
   * Historical routes must NEVER survive
   * in the prospective sitemap.
   */
  if (
    inventory.historicalStillPresent
      .length > 0
  ) {
    throw new Error(
      `Historical routes remain in composed sitemap: ${inventory.historicalStillPresent.join(", ")}`
    );
  }

  /*
   * Every current Registry route must exist
   * in the prospective sitemap.
   */
  if (
    inventory.currentMissing
      .length > 0
  ) {
    throw new Error(
      `Current Registry routes missing from composed sitemap: ${inventory.currentMissing.join(", ")}`
    );
  }

  return {
    status:
      "PASS",

    sitemapPath,

    originalSha256,

    composedSha256,

    afterSha256,

    originalBytes,

    composedBytes,

    sourceUnchanged:
      afterXml ===
      existingXml,

    inventory
  };
}

async function main() {
  const result =
    await auditComposedSitemap();

  console.log(
    "SITEMAP_COMPOSER_DRY_RUN=PASS"
  );

  console.log(
    `Sitemap: ${result.sitemapPath}`
  );

  console.log(
    `Original SHA-256: ${result.originalSha256}`
  );

  console.log(
    `Prospective SHA-256: ${result.composedSha256}`
  );

  console.log(
    `Post-audit SHA-256: ${result.afterSha256}`
  );

  console.log(
    `Original bytes: ${result.originalBytes}`
  );

  console.log(
    `Prospective bytes: ${result.composedBytes}`
  );

  console.log(
    `Original URLs: ${result.inventory.existingCount}`
  );

  console.log(
    `Prospective URLs: ${result.inventory.composedCount}`
  );

  console.log(
    `URLs added: ${result.inventory.addedUrls.length}`
  );

  console.log(
    `URLs removed: ${result.inventory.removedUrls.length}`
  );

  console.log(
    `Current Registry routes: ${result.inventory.currentRoutesConfigured}`
  );

  console.log(
    `Historical routes: ${result.inventory.historicalRoutesConfigured}`
  );

  console.log(
    `Historical routes excluded: ${result.inventory.historicalRoutesExcluded}`
  );

  console.log(
    `Current routes missing: ${result.inventory.currentMissing.length}`
  );

  console.log(
    `Historical routes still present: ${result.inventory.historicalStillPresent.length}`
  );

  console.log(
    `Source unchanged: ${result.sourceUnchanged}`
  );

  console.log(
    `Current-route replacements: ${result.inventory.duplicateCurrentRoutesReplaced}`
  );
}

if (
  require.main === module
) {
  main()
    .catch(error => {
      console.error(
        "SITEMAP_COMPOSER_DRY_RUN=FAIL"
      );

      console.error(
        error.stack ||
        error.message
      );

      process.exitCode = 1;
    });
}

module.exports = {
  DEFAULT_SITEMAP_PATH,
  sha256,
  assertSitemapPath,
  readSitemap,
  calculateInventory,
  auditComposedSitemap
};
