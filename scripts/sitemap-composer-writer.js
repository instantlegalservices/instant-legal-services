/**
 * Instant Legal Services
 * Canonical Sitemap Composer Atomic Writer
 *
 * Purpose:
 * - Read the existing root sitemap.xml.
 * - Load the validated Location Registry feeds.
 * - Compose existing static/SEO URLs with current location routes.
 * - Remove historical location routes.
 * - Remove stale metadata from Registry-owned current routes.
 * - Validate the complete final sitemap.
 * - Atomically replace sitemap.xml.
 *
 * Safety:
 * - Existing sitemap is never modified before all validation succeeds.
 * - Registry feed is validated before composition.
 * - Final composed XML is validated before any write.
 * - Temporary file is created in the same directory.
 * - Atomic rename is used for final replacement.
 * - Existing sitemap remains untouched on validation/feed failure.
 * - No direct database access.
 * - No direct Supabase credentials.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  loadLocationFeeds
} = require("./location-registry-feed");

const {
  composeSitemap,
  validateComposedSitemap
} = require("./sitemap-composer");

const DEFAULT_SITEMAP_PATH =
  path.join(
    process.cwd(),
    "sitemap.xml"
  );

/**
 * Validate a sitemap file path.
 *
 * Both input and output must explicitly target
 * sitemap.xml. This prevents accidental writes
 * to arbitrary repository files.
 */
function assertSitemapPath(
  sitemapPath,
  field = "sitemapPath"
) {
  if (
    typeof sitemapPath !== "string" ||
    !sitemapPath.trim()
  ) {
    throw new Error(
      `${field} must be a non-empty string`
    );
  }

  const resolved =
    path.resolve(
      sitemapPath
    );

  if (
    path.basename(resolved) !==
    "sitemap.xml"
  ) {
    throw new Error(
      `${field} must target sitemap.xml: ${resolved}`
    );
  }

  return resolved;
}

/**
 * Reject symlink targets.
 *
 * We do not silently follow a symlink for the
 * production sitemap input/output.
 */
async function assertNotSymlink(
  filePath,
  field
) {
  try {
    const stat =
      await fs.promises.lstat(
        filePath
      );

    if (
      stat.isSymbolicLink()
    ) {
      throw new Error(
        `${field} must not be a symbolic link: ${filePath}`
      );
    }
  } catch (error) {
    if (
      error &&
      error.code === "ENOENT"
    ) {
      return;
    }

    throw error;
  }
}

/**
 * Create a unique temporary file path in the
 * SAME directory as sitemap.xml.
 */
function createTemporaryPath(
  outputPath
) {
  const directory =
    path.dirname(
      outputPath
    );

  const filename =
    path.basename(
      outputPath
    );

  const randomPart =
    crypto
      .randomBytes(16)
      .toString("hex");

  return path.join(
    directory,
    `.${filename}.${process.pid}.${randomPart}.tmp`
  );
}

/**
 * Atomically compose and replace the root sitemap.
 *
 * Options:
 * - inputPath
 * - outputPath
 * - loadFeedsFn
 *
 * Production:
 *   inputPath  = sitemap.xml
 *   outputPath = sitemap.xml
 *
 * Tests may inject loadFeedsFn.
 */
async function writeComposedSitemap(
  options = {}
) {
  const inputPath =
    assertSitemapPath(
      options.inputPath ||
        DEFAULT_SITEMAP_PATH,
      "inputPath"
    );

  const outputPath =
    assertSitemapPath(
      options.outputPath ||
        DEFAULT_SITEMAP_PATH,
      "outputPath"
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

  const outputDirectory =
    path.dirname(
      outputPath
    );

  if (
    !fs.existsSync(
      outputDirectory
    )
  ) {
    throw new Error(
      `Sitemap output directory does not exist: ${outputDirectory}`
    );
  }

  /*
   * Never follow symlinks for the sitemap
   * source or destination.
   */
  await assertNotSymlink(
    inputPath,
    "inputPath"
  );

  await assertNotSymlink(
    outputPath,
    "outputPath"
  );

  /*
   * The existing root sitemap is mandatory.
   *
   * Fail closed instead of creating a new sitemap
   * from Registry data alone.
   */
  let existingXml;

  try {
    existingXml =
      await fs.promises.readFile(
        inputPath,
        "utf8"
      );
  } catch (error) {
    throw new Error(
      `Unable to read existing sitemap: ${error.message}`
    );
  }

  if (
    typeof existingXml !== "string" ||
    !existingXml.trim()
  ) {
    throw new Error(
      "Existing sitemap.xml is empty"
    );
  }

  /*
   * Load Registry feeds BEFORE touching output.
   */
  const feeds =
    await loadFeedsFn();

  if (
    !feeds ||
    typeof feeds !== "object" ||
    Array.isArray(feeds)
  ) {
    throw new Error(
      "Location Registry feed loader returned an invalid result"
    );
  }

  const currentRows =
    feeds.currentRows;

  const redirectRows =
    feeds.redirectRows;

  if (
    !Array.isArray(
      currentRows
    )
  ) {
    throw new Error(
      "Location Registry loader did not return currentRows"
    );
  }

  if (
    !Array.isArray(
      redirectRows
    )
  ) {
    throw new Error(
      "Location Registry loader did not return redirectRows"
    );
  }

  /*
   * Compose entirely in memory.
   *
   * composeSitemap() itself:
   * - parses the existing sitemap
   * - validates Registry feeds
   * - validates current/historical separation
   * - excludes historical routes
   * - adds current routes
   * - removes stale Registry metadata
   * - sorts deterministically
   * - validates URL and sitemap limits
   */
  const result =
    composeSitemap(
      existingXml,
      currentRows,
      redirectRows
    );

  if (
    !result ||
    typeof result !== "object"
  ) {
    throw new Error(
      "Sitemap composer returned an invalid result"
    );
  }

  const finalXml =
    result.xml;

  if (
    typeof finalXml !== "string" ||
    !finalXml
  ) {
    throw new Error(
      "Sitemap composer returned empty XML"
    );
  }

  /*
   * Defensive second validation at the writer boundary.
   *
   * Even though composeSitemap() validates internally,
   * the writer must independently verify the exact bytes
   * that it is about to write.
   */
  validateComposedSitemap(
    finalXml
  );

  /*
   * Verify the output directory again immediately
   * before creating the temporary file.
   */
  if (
    !fs.existsSync(
      outputDirectory
    )
  ) {
    throw new Error(
      `Sitemap output directory disappeared: ${outputDirectory}`
    );
  }

  const temporaryPath =
    createTemporaryPath(
      outputPath
    );

  let temporaryHandle =
    null;

  let renamed =
    false;

  try {
    /*
     * wx prevents accidental reuse of a temporary file.
     */
    temporaryHandle =
      await fs.promises.open(
        temporaryPath,
        "wx",
        0o644
      );

    /*
     * Write the COMPLETE final sitemap.
     */
    await temporaryHandle.writeFile(
      finalXml,
      "utf8"
    );

    /*
     * Flush sitemap contents before rename.
     */
    await temporaryHandle.sync();

    await temporaryHandle.close();

    temporaryHandle =
      null;

    /*
     * Re-check destination symlink state immediately
     * before replacement.
     */
    await assertNotSymlink(
      outputPath,
      "outputPath"
    );

    /*
     * Atomic replacement.
     *
     * The existing sitemap remains untouched until
     * this operation.
     */
    await fs.promises.rename(
      temporaryPath,
      outputPath
    );

    renamed =
      true;

    /*
     * Best-effort directory fsync for rename durability.
     *
     * If unsupported, the already-completed atomic
     * replacement is not rolled back.
     */
    try {
      const directoryHandle =
        await fs.promises.open(
          outputDirectory,
          "r"
        );

      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }
    } catch {
      /*
       * Directory fsync is a durability enhancement.
       * Do not convert a successful atomic replacement
       * into a failure.
       */
    }

    const stat =
      await fs.promises.stat(
        outputPath
      );

    /*
     * Defensive post-write validation.
     *
     * Read back the exact sitemap now present at the
     * destination and validate it again.
     */
    const writtenXml =
      await fs.promises.readFile(
        outputPath,
        "utf8"
      );

    validateComposedSitemap(
      writtenXml
    );

    return {
      status:
        "PASS",

      inputPath,

      outputPath,

      bytes:
        stat.size,

      existingCount:
        result.existingCount,

      currentLocationCount:
        result.currentLocationCount,

      historicalRoutesExcluded:
        result.historicalRoutesExcluded,

      duplicateCurrentRoutesReplaced:
        result.duplicateCurrentRoutesReplaced,

      finalCount:
        result.finalCount,

      atomicReplacement:
        true
    };
  } catch (error) {
    /*
     * Close temporary handle if still open.
     */
    if (
      temporaryHandle
    ) {
      try {
        await temporaryHandle.close();
      } catch {
        // Preserve original failure.
      }
    }

    /*
     * IMPORTANT:
     *
     * Never delete the destination sitemap here.
     *
     * If rename() has not completed, the original
     * sitemap remains untouched.
     */
    if (
      !renamed
    ) {
      try {
        await fs.promises.unlink(
          temporaryPath
        );
      } catch {
        /*
         * Ignore temporary cleanup failure.
         * Preserve the original error.
         */
      }
    }

    throw error;
  }
}

/**
 * Standalone CLI.
 *
 * Production/CI usage:
 *
 * node scripts/sitemap-composer-writer.js
 */
async function main() {
  const result =
    await writeComposedSitemap();

  console.log(
    "SITEMAP_COMPOSER_WRITER=PASS"
  );

  console.log(
    `Input: ${result.inputPath}`
  );

  console.log(
    `Output: ${result.outputPath}`
  );

  console.log(
    `Existing URLs: ${result.existingCount}`
  );

  console.log(
    `Current location URLs: ${result.currentLocationCount}`
  );

  console.log(
    `Historical URLs excluded: ${result.historicalRoutesExcluded}`
  );

  console.log(
    `Current-route replacements: ${result.duplicateCurrentRoutesReplaced}`
  );

  console.log(
    `Final URL count: ${result.finalCount}`
  );

  console.log(
    `Bytes: ${result.bytes}`
  );

  console.log(
    `Atomic replacement: ${result.atomicReplacement}`
  );
}

if (
  require.main === module
) {
  main()
    .catch(error => {
      console.error(
        "SITEMAP_COMPOSER_WRITER=FAIL"
      );

      console.error(
        error.message
      );

      process.exitCode = 1;
    });
}

module.exports = {
  DEFAULT_SITEMAP_PATH,
  assertSitemapPath,
  assertNotSymlink,
  createTemporaryPath,
  writeComposedSitemap
};
