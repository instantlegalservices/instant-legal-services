/**
 * Instant Legal Services
 * Location Sitemap Atomic Writer
 *
 * Purpose:
 * - Load the validated Location Registry feed.
 * - Generate the current-location sitemap.
 * - Validate the generated XML again.
 * - Write through a same-directory temporary file.
 * - fsync the temporary file.
 * - Atomically replace the target sitemap.
 *
 * Safety:
 * - Never writes before feed + XML validation succeeds.
 * - Historical routes are never written to the sitemap.
 * - Existing sitemap remains untouched if generation/validation fails.
 * - No direct database access.
 * - Registry access remains isolated in location-registry-feed.js.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  loadLocationFeeds
} = require("./location-registry-feed");

const {
  buildLocationSitemap
} = require("./location-sitemap");

const DEFAULT_OUTPUT_PATH =
  path.join(
    process.cwd(),
    "sitemap.xml"
  );

/**
 * Validate the target output path.
 */
function assertOutputPath(
  outputPath
) {
  if (
    typeof outputPath !== "string" ||
    !outputPath.trim()
  ) {
    throw new Error(
      "outputPath must be a non-empty string"
    );
  }

  const resolved =
    path.resolve(
      outputPath
    );

  if (
    path.basename(resolved) !==
    "sitemap.xml"
  ) {
    throw new Error(
      `outputPath must target sitemap.xml: ${resolved}`
    );
  }

  return resolved;
}

/**
 * Create a unique temporary path in the
 * SAME directory as the final sitemap.
 *
 * Same-directory placement is important because
 * rename() must remain on the same filesystem
 * for the intended atomic replacement semantics.
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
 * Write a complete sitemap atomically.
 *
 * The input must already be validated by
 * buildLocationSitemap().
 *
 * Options:
 * - outputPath
 * - loadFeedsFn
 *
 * loadFeedsFn is injectable only for deterministic
 * tests. Production uses loadLocationFeeds().
 */
async function writeLocationSitemap(
  options = {}
) {
  const outputPath =
    assertOutputPath(
      options.outputPath ||
        DEFAULT_OUTPUT_PATH
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

  /*
   * The destination directory must already exist.
   *
   * We deliberately do NOT create arbitrary
   * directories as part of the production writer.
   */
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
   * Load and validate the Registry feeds BEFORE
   * touching the destination sitemap.
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

  if (
    !Array.isArray(
      currentRows
    )
  ) {
    throw new Error(
      "Location Registry loader did not return currentRows"
    );
  }

  /*
   * Generate + validate the complete sitemap
   * BEFORE opening any output file.
   */
  const xml =
    buildLocationSitemap(
      currentRows
    );

  if (
    typeof xml !== "string" ||
    !xml
  ) {
    throw new Error(
      "Generated sitemap XML is empty"
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
     * wx = create new file and fail if it already exists.
     *
     * This prevents accidental overwrite of an
     * unrelated temporary file.
     */
    temporaryHandle =
      await fs.promises.open(
        temporaryPath,
        "wx",
        0o644
      );

    /*
     * Write the complete XML to the temporary file.
     */
    await temporaryHandle.writeFile(
      xml,
      "utf8"
    );

    /*
     * Flush file contents to the filesystem
     * before the atomic rename.
     */
    await temporaryHandle.sync();

    await temporaryHandle.close();

    temporaryHandle =
      null;

    /*
     * Atomic replacement:
     *
     * On the same filesystem, rename() replaces
     * the destination as one filesystem operation.
     *
     * The old sitemap therefore remains in place
     * until this point.
     */
    await fs.promises.rename(
      temporaryPath,
      outputPath
    );

    renamed =
      true;

    /*
     * Best-effort directory fsync.
     *
     * This improves durability of the rename on
     * filesystems that support directory handles.
     *
     * Failure here does NOT roll back an already
     * completed atomic rename.
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
       * The atomic rename itself has already completed.
       */
    }

    const stat =
      await fs.promises.stat(
        outputPath
      );

    return {
      status: "PASS",
      outputPath,
      bytes: stat.size,
      currentRoutes:
        currentRows.length,
      historicalRoutesExcluded:
        Array.isArray(
          feeds.redirectRows
        )
          ? feeds.redirectRows.length
          : 0,
      atomicReplacement: true
    };
  } catch (error) {
    /*
     * Close the temporary handle if anything failed
     * before it was closed.
     */
    if (
      temporaryHandle
    ) {
      try {
        await temporaryHandle.close();
      } catch {
        // Preserve the original failure.
      }
    }

    /*
     * Never delete the destination sitemap here.
     *
     * If rename() never completed, the existing
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
         * Ignore cleanup failure.
         * The original error is more important.
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
 * node scripts/location-sitemap-writer.js
 */
async function main() {
  const result =
    await writeLocationSitemap();

  console.log(
    "LOCATION_SITEMAP_WRITER=PASS"
  );

  console.log(
    `Output: ${result.outputPath}`
  );

  console.log(
    `Current routes: ${result.currentRoutes}`
  );

  console.log(
    `Historical routes excluded: ${result.historicalRoutesExcluded}`
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
        "LOCATION_SITEMAP_WRITER=FAIL"
      );

      console.error(
        error.message
      );

      process.exitCode = 1;
    });
}

module.exports = {
  DEFAULT_OUTPUT_PATH,
  assertOutputPath,
  createTemporaryPath,
  writeLocationSitemap
};
