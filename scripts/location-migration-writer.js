/**
 * Instant Legal Services
 * Location Migration Atomic Artifact Writer
 *
 * IMPORTANT:
 * - Artifact writer only.
 * - Does NOT modify sitemap.xml.
 * - Does NOT deploy redirects.
 * - Does NOT access database.
 * - Uses atomic replacement.
 * - Fails closed.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  normalizeManifestEntry,
  buildManifestIndex,
  rollbackMigration,
  serializeManifest,
  serializeRedirects,
  sha256Json
} = require("./location-migration");

const ARTIFACT_FILENAME =
  "location-migration-artifact.json";

const ARTIFACT_VERSION =
  "location-migration-artifact-v1";

const DEFAULT_OUTPUT_PATH =
  path.join(
    process.cwd(),
    ARTIFACT_FILENAME
  );

function fail(message) {
  throw new Error(message);
}

function assertArtifactPath(
  artifactPath,
  field = "artifactPath"
) {
  if (
    typeof artifactPath !== "string" ||
    !artifactPath.trim()
  ) {
    fail(`${field} must be a non-empty string`);
  }

  const resolved =
    path.resolve(artifactPath);

  if (
    path.basename(resolved) !==
    ARTIFACT_FILENAME
  ) {
    fail(
      `${field} must target ${ARTIFACT_FILENAME}`
    );
  }

  return resolved;
}

async function assertNotSymlink(
  filePath,
  field
) {
  try {
    const stat =
      await fs.promises.lstat(filePath);

    if (stat.isSymbolicLink()) {
      fail(
        `${field} must not be a symbolic link`
      );
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

function createTemporaryPath(
  outputPath
) {
  const random =
    crypto
      .randomBytes(16)
      .toString("hex");

  return path.join(
    path.dirname(outputPath),
    `.${ARTIFACT_FILENAME}.${process.pid}.${random}.tmp`
  );
}

function validateMigrationResult(
  result
) {
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result)
  ) {
    fail(
      "migration result must be an object"
    );
  }

  const migratedManifest =
    result.migratedManifest
      .map(normalizeManifestEntry)
      .sort(
        (a, b) =>
          a.sourceId.localeCompare(
            b.sourceId
          )
      );

  buildManifestIndex(
    migratedManifest,
    "migratedManifest"
  );

  if (
    !Array.isArray(result.redirects)
  ) {
    fail("redirects must be an array");
  }

  /*
   * Serialize independently at the writer boundary.
   */
  const redirectJson =
    serializeRedirects(
      result.redirects
    );

  const redirects =
    JSON.parse(
      redirectJson
    );

  /*
   * Every redirect must point directly to
   * the final current route owned by the
   * same sourceId.
   */
  const seen =
    new Set();

  for (const redirect of redirects) {
    if (
      seen.has(redirect.from)
    ) {
      fail(
        `Duplicate redirect source: ${redirect.from}`
      );
    }

    seen.add(
      redirect.from
    );

    if (
      redirect.from ===
      redirect.to
    ) {
      fail(
        `Self redirect rejected: ${redirect.from}`
      );
    }

    if (
      buildManifestIndex(
        migratedManifest,
        "migratedManifest"
      ).byRoute.has(
        redirect.from
      )
    ) {
      fail(
        `Redirect source is still current: ${redirect.from}`
      );
    }

    const owner =
      buildManifestIndex(
        migratedManifest,
        "migratedManifest"
      ).byRoute.get(
        redirect.to
      );

    if (!owner) {
      fail(
        `Redirect target is not current: ${redirect.to}`
      );
    }

    if (
      owner.sourceId !==
      redirect.sourceId
    ) {
      fail(
        `Redirect target ownership mismatch: ${redirect.from} -> ${redirect.to}`
      );
    }
  }

  if (
    !Array.isArray(
      result.sitemapRoutes
    )
  ) {
    fail(
      "sitemapRoutes must be an array"
    );
  }

  const expectedSitemapRoutes =
    migratedManifest
      .map(
        entry => entry.route
      )
      .sort();

  const actualSitemapRoutes =
    [...result.sitemapRoutes].sort();

  if (
    JSON.stringify(
      expectedSitemapRoutes
    ) !==
    JSON.stringify(
      actualSitemapRoutes
    )
  ) {
    fail(
      "sitemapRoutes do not match current manifest routes"
    );
  }

  /*
   * Rollback must independently verify.
   */
  const rollback =
    rollbackMigration(
      result.rollback
    );

  if (
    rollback.restored !== true
  ) {
    fail(
      "Rollback verification failed"
    );
  }

  if (
    !result.summary ||
    result.summary.status !==
      "PASS"
  ) {
    fail(
      "Migration summary must be PASS"
    );
  }

  if (
    result.summary.migrated !==
      redirects.length
  ) {
    fail(
      "Migration count mismatch"
    );
  }

  return {
    migratedManifest,
    redirects,
    sitemapRoutes:
      expectedSitemapRoutes,
    rollback:
      result.rollback,
    summary:
      result.summary
  };
}

function buildArtifact(
  migrationResult
) {
  const validated =
    validateMigrationResult(
      migrationResult
    );

  const payload = {
    artifactVersion:
      ARTIFACT_VERSION,

    migratedManifest:
      validated.migratedManifest,

    redirects:
      validated.redirects,

    sitemapRoutes:
      validated.sitemapRoutes,

    rollback:
      validated.rollback,

    summary:
      validated.summary
  };

  return {
    ...payload,

    artifactSha256:
      sha256Json(payload)
  };
}

function validateArtifact(
  artifact
) {
  if (
    !artifact ||
    typeof artifact !== "object" ||
    Array.isArray(artifact)
  ) {
    fail("Invalid migration artifact");
  }

  if (
    artifact.artifactVersion !==
    ARTIFACT_VERSION
  ) {
    fail(
      `Unsupported artifact version: ${artifact.artifactVersion}`
    );
  }

  if (
    typeof artifact.artifactSha256 !==
      "string" ||
    !/^[a-f0-9]{64}$/i.test(
      artifact.artifactSha256
    )
  ) {
    fail(
      "Invalid artifact SHA-256"
    );
  }

  const payload = {
    artifactVersion:
      artifact.artifactVersion,

    migratedManifest:
      artifact.migratedManifest,

    redirects:
      artifact.redirects,

    sitemapRoutes:
      artifact.sitemapRoutes,

    rollback:
      artifact.rollback,

    summary:
      artifact.summary
  };

  const calculated =
    sha256Json(payload);

  if (
    calculated !==
    artifact.artifactSha256
  ) {
    fail(
      "Artifact integrity check failed"
    );
  }

  validateMigrationResult(
    payload
  );

  return true;
}

async function writeMigrationArtifact(
  migrationResult,
  options = {}
) {
  const outputPath =
    assertArtifactPath(
      options.outputPath ||
        DEFAULT_OUTPUT_PATH
    );

  const outputDirectory =
    path.dirname(outputPath);

  if (
    !fs.existsSync(
      outputDirectory
    )
  ) {
    fail(
      `Output directory does not exist: ${outputDirectory}`
    );
  }

  await assertNotSymlink(
    outputPath,
    "outputPath"
  );

  /*
   * Complete validation BEFORE destination
   * is touched.
   */
  const artifact =
    buildArtifact(
      migrationResult
    );

  const artifactJson =
    JSON.stringify(
      artifact,
      null,
      2
    ) + "\n";

  validateArtifact(
    JSON.parse(
      artifactJson
    )
  );

  const temporaryPath =
    createTemporaryPath(
      outputPath
    );

  let handle = null;
  let renamed = false;

  try {
    handle =
      await fs.promises.open(
        temporaryPath,
        "wx",
        0o644
      );

    await handle.writeFile(
      artifactJson,
      "utf8"
    );

    await handle.sync();
    await handle.close();

    handle = null;

    await assertNotSymlink(
      outputPath,
      "outputPath"
    );

    /*
     * Atomic replacement.
     */
    await fs.promises.rename(
      temporaryPath,
      outputPath
    );

    renamed = true;

    /*
     * Validate exact bytes written.
     */
    const written =
      await fs.promises.readFile(
        outputPath,
        "utf8"
      );

    validateArtifact(
      JSON.parse(written)
    );

    return {
      status: "PASS",
      outputPath,
      bytes:
        Buffer.byteLength(
          written,
          "utf8"
        ),
      artifactSha256:
        artifact.artifactSha256,
      atomicReplacement: true
    };
  } catch (error) {
    if (handle) {
      try {
        await handle.close();
      } catch {}
    }

    if (!renamed) {
      try {
        await fs.promises.unlink(
          temporaryPath
        );
      } catch {}
    }

    throw error;
  }
}

async function readMigrationArtifact(
  artifactPath =
    DEFAULT_OUTPUT_PATH
) {
  const resolved =
    assertArtifactPath(
      artifactPath
    );

  await assertNotSymlink(
    resolved,
    "artifactPath"
  );

  const content =
    await fs.promises.readFile(
      resolved,
      "utf8"
    );

  const artifact =
    JSON.parse(content);

  validateArtifact(
    artifact
  );

  return artifact;
}

if (
  require.main === module
) {
  console.error(
    "LOCATION_MIGRATION_WRITER=FAIL"
  );

  console.error(
    "Explicit migration result required; production execution is disabled."
  );

  process.exitCode = 1;
}

module.exports = {
  DEFAULT_OUTPUT_PATH,
  ARTIFACT_FILENAME,
  ARTIFACT_VERSION,
  assertArtifactPath,
  assertNotSymlink,
  createTemporaryPath,
  validateMigrationResult,
  buildArtifact,
  validateArtifact,
  writeMigrationArtifact,
  readMigrationArtifact
};
