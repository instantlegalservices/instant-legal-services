/**
 * Instant Legal Services
 * Location Migration Writer Adversarial Test
 *
 * Verifies:
 * - valid migration artifact can be built
 * - artifact can be atomically written
 * - written artifact can be read and verified
 * - artifact integrity detects tampering
 * - invalid migration result cannot replace destination
 * - existing destination survives pre-write validation failure
 * - symlink destination is rejected
 * - temporary files are cleaned
 * - rollback remains independently verifiable
 * - sitemap routes contain current routes only
 * - redirect ownership is enforced
 */

"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  migrateLocations,
  ACTIVE_STATUS
} = require("./location-migration");

const {
  ARTIFACT_FILENAME,
  buildArtifact,
  validateArtifact,
  writeMigrationArtifact,
  readMigrationArtifact
} = require("./location-migration-writer");

let pass = 0;
let fail = 0;

function test(name, fn) {
  try {
    fn();

    pass++;

    console.log(
      `PASS: ${name}`
    );
  } catch (error) {
    fail++;

    console.error(
      `FAIL: ${name}`
    );

    console.error(
      `      ${error.message}`
    );
  }
}

async function asyncTest(
  name,
  fn
) {
  try {
    await fn();

    pass++;

    console.log(
      `PASS: ${name}`
    );
  } catch (error) {
    fail++;

    console.error(
      `FAIL: ${name}`
    );

    console.error(
      `      ${error.message}`
    );
  }
}

function expectThrow(
  name,
  fn
) {
  test(
    name,
    () => {
      assert.throws(
        fn
      );
    }
  );
}

async function expectAsyncThrow(
  name,
  fn
) {
  await asyncTest(
    name,
    async () => {
      await assert.rejects(
        fn
      );
    }
  );
}

function makeTempDirectory() {
  return fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "ils-location-migration-writer-"
    )
  );
}

function cleanupDirectory(
  directory
) {
  fs.rmSync(
    directory,
    {
      recursive: true,
      force: true
    }
  );
}

const DISTRICT_ID =
  "11111111-1111-4111-8111-111111111111";

const TEHSIL_ID =
  "22222222-2222-4222-8222-222222222222";

function makeManifest() {
  return [
    {
      sourceId:
        DISTRICT_ID,

      locationType:
        "DISTRICT",

      route:
        "/district/bareilly/",

      canonical:
        "/district/bareilly/",

      previousRoutes:
        [],

      status:
        ACTIVE_STATUS,

      generatorVersion:
        "location-migration-test-v1"
    },

    {
      sourceId:
        TEHSIL_ID,

      locationType:
        "TEHSIL",

      route:
        "/tehsil/aonla/",

      canonical:
        "/tehsil/aonla/",

      previousRoutes:
        [],

      status:
        ACTIVE_STATUS,

      generatorVersion:
        "location-migration-test-v1"
    }
  ];
}

function makeMigrationResult() {
  return migrateLocations(
    makeManifest(),
    [
      {
        sourceId:
          DISTRICT_ID,

        locationType:
          "DISTRICT",

        newRoute:
          "/uttar-pradesh/bareilly/",

        canonical:
          "/uttar-pradesh/bareilly/"
      }
    ],
    {
      generatorVersion:
        "location-migration-test-v1"
    }
  );
}

async function main() {
  /*
   * -------------------------------------------------
   * 1. BUILD ARTIFACT
   * -------------------------------------------------
   */

  const result =
    makeMigrationResult();

  test(
    "migration result has PASS summary",
    () => {
      assert.strictEqual(
        result.summary.status,
        "PASS"
      );
    }
  );

  test(
    "artifact builds successfully",
    () => {
      const artifact =
        buildArtifact(
          result
        );

      assert.strictEqual(
        artifact.artifactVersion,
        "location-migration-artifact-v1"
      );

      assert.match(
        artifact.artifactSha256,
        /^[a-f0-9]{64}$/
      );

      assert.strictEqual(
        artifact.summary.status,
        "PASS"
      );
    }
  );

  test(
    "artifact passes independent integrity validation",
    () => {
      const artifact =
        buildArtifact(
          result
        );

      assert.strictEqual(
        validateArtifact(
          artifact
        ),
        true
      );
    }
  );

  /*
   * -------------------------------------------------
   * 2. CONTENT CONTRACT
   * -------------------------------------------------
   */

  test(
    "artifact contains current sitemap routes only",
    () => {
      const artifact =
        buildArtifact(
          result
        );

      assert.deepStrictEqual(
        artifact.sitemapRoutes,
        [
          "/tehsil/aonla/",
          "/uttar-pradesh/bareilly/"
        ]
      );

      assert.ok(
        !artifact.sitemapRoutes.includes(
          "/district/bareilly/"
        )
      );
    }
  );

  test(
    "artifact contains exact direct redirect",
    () => {
      const artifact =
        buildArtifact(
          result
        );

      assert.deepStrictEqual(
        artifact.redirects,
        [
          {
            sourceId:
              DISTRICT_ID,

            locationType:
              "DISTRICT",

            from:
              "/district/bareilly/",

            to:
              "/uttar-pradesh/bareilly/",

            status:
              "REDIRECT-REQUIRED"
          }
        ]
      );
    }
  );

  test(
    "artifact contains rollback snapshot",
    () => {
      const artifact =
        buildArtifact(
          result
        );

      assert.ok(
        artifact.rollback
      );

      assert.ok(
        Array.isArray(
          artifact.rollback.manifest
        )
      );

      assert.match(
        artifact.rollback.sha256,
        /^[a-f0-9]{64}$/
      );
    }
  );

  /*
   * -------------------------------------------------
   * 3. ATOMIC WRITE
   * -------------------------------------------------
   */

  {
    const directory =
      makeTempDirectory();

    try {
      const outputPath =
        path.join(
          directory,
          ARTIFACT_FILENAME
        );

      await asyncTest(
        "valid artifact is atomically written",
        async () => {
          const writeResult =
            await writeMigrationArtifact(
              result,
              {
                outputPath
              }
            );

          assert.strictEqual(
            writeResult.status,
            "PASS"
          );

          assert.strictEqual(
            writeResult.atomicReplacement,
            true
          );

          assert.ok(
            writeResult.bytes > 0
          );
        }
      );

      await asyncTest(
        "written artifact can be read and verified",
        async () => {
          const artifact =
            await readMigrationArtifact(
              outputPath
            );

          assert.strictEqual(
            artifact.artifactVersion,
            "location-migration-artifact-v1"
          );

          assert.strictEqual(
            artifact.summary.status,
            "PASS"
          );
        }
      );

      await asyncTest(
        "temporary files are removed after successful write",
        async () => {
          const files =
            await fs.promises.readdir(
              directory
            );

          assert.deepStrictEqual(
            files.filter(
              file =>
                file.endsWith(".tmp")
            ),
            []
          );
        }
      );
    } finally {
      cleanupDirectory(
        directory
      );
    }
  }

  /*
   * -------------------------------------------------
   * 4. TAMPER DETECTION
   * -------------------------------------------------
   */

  {
    const directory =
      makeTempDirectory();

    try {
      const outputPath =
        path.join(
          directory,
          ARTIFACT_FILENAME
        );

      await writeMigrationArtifact(
        result,
        {
          outputPath
        }
      );

      const artifact =
        JSON.parse(
          fs.readFileSync(
            outputPath,
            "utf8"
          )
        );

      artifact.sitemapRoutes.push(
        "/tampered-route/"
      );

      fs.writeFileSync(
        outputPath,
        JSON.stringify(
          artifact,
          null,
          2
        ) + "\n",
        "utf8"
      );

      await expectAsyncThrow(
        "tampered artifact is rejected",
        async () => {
          await readMigrationArtifact(
            outputPath
          );
        }
      );
    } finally {
      cleanupDirectory(
        directory
      );
    }
  }

  /*
   * -------------------------------------------------
   * 5. INVALID REDIRECT OWNERSHIP
   * -------------------------------------------------
   */

  {
    const invalidResult =
      makeMigrationResult();

    invalidResult.redirects =
      [
        {
          sourceId:
            TEHSIL_ID,

          locationType:
            "TEHSIL",

          from:
            "/district/bareilly/",

          to:
            "/uttar-pradesh/bareilly/",

          status:
            "REDIRECT-REQUIRED"
        }
      ];

    expectThrow(
      "redirect ownership mismatch is rejected",
      () => {
        buildArtifact(
          invalidResult
        );
      }
    );
  }

  /*
   * -------------------------------------------------
   * 6. SELF REDIRECT
   * -------------------------------------------------
   */

  {
    const invalidResult =
      makeMigrationResult();

    invalidResult.redirects =
      [
        {
          sourceId:
            DISTRICT_ID,

          locationType:
            "DISTRICT",

          from:
            "/uttar-pradesh/bareilly/",

          to:
            "/uttar-pradesh/bareilly/",

          status:
            "REDIRECT-REQUIRED"
        }
      ];

    expectThrow(
      "self redirect is rejected",
      () => {
        buildArtifact(
          invalidResult
        );
      }
    );
  }

  /*
   * -------------------------------------------------
   * 7. INVALID DESTINATION PRESERVATION
   * -------------------------------------------------
   */

  {
    const directory =
      makeTempDirectory();

    try {
      const outputPath =
        path.join(
          directory,
          ARTIFACT_FILENAME
        );

      const original =
        JSON.stringify(
          {
            sentinel:
              "DO-NOT-REPLACE"
          },
          null,
          2
        ) + "\n";

      fs.writeFileSync(
        outputPath,
        original,
        "utf8"
      );

      const invalidResult =
        makeMigrationResult();

      invalidResult.redirects =
        [
          {
            sourceId:
              DISTRICT_ID,

            locationType:
              "DISTRICT",

            from:
              "/bad-source/",

            to:
              "/not-current/",

            status:
              "REDIRECT-REQUIRED"
          }
        ];

      await expectAsyncThrow(
        "invalid artifact does not replace existing destination",
        async () => {
          await writeMigrationArtifact(
            invalidResult,
            {
              outputPath
            }
          );
        }
      );

      const after =
        fs.readFileSync(
          outputPath,
          "utf8"
        );

      assert.strictEqual(
        after,
        original
      );
    } finally {
      cleanupDirectory(
        directory
      );
    }
  }

  /*
   * -------------------------------------------------
   * 8. SYMLINK REJECTION
   * -------------------------------------------------
   */

  {
    const directory =
      makeTempDirectory();

    try {
      const realPath =
        path.join(
          directory,
          "real-artifact.json"
        );

      const outputPath =
        path.join(
          directory,
          ARTIFACT_FILENAME
        );

      fs.writeFileSync(
        realPath,
        "sentinel\n",
        "utf8"
      );

      fs.symlinkSync(
        realPath,
        outputPath
      );

      await expectAsyncThrow(
        "symlink destination is rejected",
        async () => {
          await writeMigrationArtifact(
            result,
            {
              outputPath
            }
          );
        }
      );
    } finally {
      cleanupDirectory(
        directory
      );
    }
  }

  /*
   * -------------------------------------------------
   * 9. MISSING DIRECTORY
   * -------------------------------------------------
   */

  {
    const directory =
      path.join(
        os.tmpdir(),
        `ils-missing-${Date.now()}`
      );

    const outputPath =
      path.join(
        directory,
        ARTIFACT_FILENAME
      );

    await expectAsyncThrow(
      "missing output directory fails closed",
      async () => {
        await writeMigrationArtifact(
          result,
          {
            outputPath
          }
        );
      }
    );
  }

  /*
   * -------------------------------------------------
   * FINAL RESULT
   * -------------------------------------------------
   */

  console.log("");
  console.log(
    "================================================"
  );
  console.log(
    "LOCATION MIGRATION WRITER TEST RESULT"
  );
  console.log(
    "================================================"
  );
  console.log(
    `PASS: ${pass}`
  );
  console.log(
    `FAIL: ${fail}`
  );
  console.log(
    `TOTAL: ${pass + fail}`
  );

  if (fail !== 0) {
    console.log(
      "LOCATION_MIGRATION_WRITER_TEST=FAIL"
    );

    process.exitCode = 1;
    return;
  }

  console.log(
    "LOCATION_MIGRATION_WRITER_TEST=PASS"
  );
}

main()
  .catch(error => {
    console.error(
      "LOCATION_MIGRATION_WRITER_TEST=FAIL"
    );

    console.error(
      error.stack ||
      error.message
    );

    process.exitCode = 1;
  });
