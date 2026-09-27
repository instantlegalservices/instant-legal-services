/**
 * Instant Legal Services
 * Location Sitemap Writer Adversarial Tests
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  writeLocationSitemap,
  assertOutputPath,
  createTemporaryPath
} = require("./location-sitemap-writer");

const {
  generateLocationSitemap,
  validateGeneratedSitemap
} = require("./location-sitemap");

let pass = 0;
let fail = 0;

function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`PASS: ${name}`);
  } catch (error) {
    fail++;
    console.error(`FAIL: ${name}`);
    console.error(`      ${error.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`PASS: ${name}`);
  } catch (error) {
    fail++;
    console.error(`FAIL: ${name}`);
    console.error(`      ${error.message}`);
  }
}

async function expectAsyncThrow(name, fn) {
  await asyncTest(name, async () => {
    await assert.rejects(fn);
  });
}

function makeTempDirectory() {
  return fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "ils-location-sitemap-"
    )
  );
}

function cleanupDirectory(directory) {
  fs.rmSync(
    directory,
    {
      recursive: true,
      force: true
    }
  );
}

function makeRow(overrides = {}) {
  return {
    id:
      "11111111-1111-4111-8111-111111111111",

    location_type:
      "DISTRICT",

    canonical_name:
      "Bareilly",

    canonical_slug:
      "bareilly",

    current_route:
      "/bareilly/",

    ...overrides
  };
}

function validFeeds() {
  return {
    currentRows: [
      makeRow()
    ],

    redirectRows: [
      {
        location_id:
          "11111111-1111-4111-8111-111111111111",

        route:
          "/old-bareilly/",

        redirect_to:
          "/bareilly/"
      }
    ]
  };
}

async function main() {
  test(
    "output path must end in sitemap.xml",
    () => {
      assert.throws(() =>
        assertOutputPath(
          "/tmp/not-sitemap.xml"
        )
      );
    }
  );

  test(
    "temporary path remains in same directory",
    () => {
      const directory =
        makeTempDirectory();

      try {
        const outputPath =
          path.join(
            directory,
            "sitemap.xml"
          );

        const temporaryPath =
          createTemporaryPath(
            outputPath
          );

        assert.strictEqual(
          path.dirname(
            temporaryPath
          ),
          directory
        );

        assert.notStrictEqual(
          temporaryPath,
          outputPath
        );
      } finally {
        cleanupDirectory(
          directory
        );
      }
    }
  );

  test(
    "temporary path ends with .tmp",
    () => {
      const directory =
        makeTempDirectory();

      try {
        const outputPath =
          path.join(
            directory,
            "sitemap.xml"
          );

        const temporaryPath =
          createTemporaryPath(
            outputPath
          );

        assert.ok(
          temporaryPath.endsWith(
            ".tmp"
          )
        );
      } finally {
        cleanupDirectory(
          directory
        );
      }
    }
  );

  {
    const directory =
      makeTempDirectory();

    try {
      const outputPath =
        path.join(
          directory,
          "sitemap.xml"
        );

      await asyncTest(
        "valid Registry feed produces validated sitemap",
        async () => {
          const result =
            await writeLocationSitemap({
              outputPath,
              loadFeedsFn:
                async () =>
                  validFeeds()
            });

          assert.strictEqual(
            result.status,
            "PASS"
          );

          assert.strictEqual(
            result.currentRoutes,
            1
          );

          assert.strictEqual(
            result.historicalRoutesExcluded,
            1
          );

          assert.strictEqual(
            result.atomicReplacement,
            true
          );

          assert.ok(
            result.bytes > 0
          );

          assert.ok(
            fs.existsSync(
              outputPath
            )
          );
        }
      );

      await asyncTest(
        "written sitemap contains current route",
        async () => {
          const xml =
            await fs.promises.readFile(
              outputPath,
              "utf8"
            );

          assert.ok(
            xml.includes(
              "https://instantlegalservices.in/bareilly/"
            )
          );
        }
      );

      await asyncTest(
        "written sitemap excludes historical route",
        async () => {
          const xml =
            await fs.promises.readFile(
              outputPath,
              "utf8"
            );

          assert.ok(
            !xml.includes(
              "/old-bareilly/"
            )
          );
        }
      );

      await asyncTest(
        "written XML passes sitemap validator",
        async () => {
          const xml =
            await fs.promises.readFile(
              outputPath,
              "utf8"
            );

          assert.strictEqual(
            validateGeneratedSitemap(
              xml
            ),
            true
          );
        }
      );

      await asyncTest(
        "temporary file is not left behind",
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

  {
    const directory =
      makeTempDirectory();

    try {
      const outputPath =
        path.join(
          directory,
          "sitemap.xml"
        );

      const originalXml =
        generateLocationSitemap([
          makeRow()
        ]);

      fs.writeFileSync(
        outputPath,
        originalXml,
        "utf8"
      );

      await expectAsyncThrow(
        "invalid Registry feed does not replace existing sitemap",
        async () => {
          await writeLocationSitemap({
            outputPath,

            loadFeedsFn:
              async () => ({
                currentRows: [
                  makeRow({
                    current_route:
                      "/invalid route/"
                  })
                ],

                redirectRows: []
              })
          });
        }
      );

      const afterFailure =
        fs.readFileSync(
          outputPath,
          "utf8"
        );

      assert.strictEqual(
        afterFailure,
        originalXml
      );
    } finally {
      cleanupDirectory(
        directory
      );
    }
  }

  {
    const directory =
      makeTempDirectory();

    try {
      const outputPath =
        path.join(
          directory,
          "sitemap.xml"
        );

      const originalXml =
        generateLocationSitemap([
          makeRow()
        ]);

      fs.writeFileSync(
        outputPath,
        originalXml,
        "utf8"
      );

      await expectAsyncThrow(
        "Registry loader failure leaves existing sitemap untouched",
        async () => {
          await writeLocationSitemap({
            outputPath,

            loadFeedsFn:
              async () => {
                throw new Error(
                  "simulated Registry failure"
                );
              }
          });
        }
      );

      const afterFailure =
        fs.readFileSync(
          outputPath,
          "utf8"
        );

      assert.strictEqual(
        afterFailure,
        originalXml
      );
    } finally {
      cleanupDirectory(
        directory
      );
    }
  }

  await expectAsyncThrow(
    "missing currentRows is rejected",
    async () => {
      const directory =
        makeTempDirectory();

      try {
        await writeLocationSitemap({
          outputPath:
            path.join(
              directory,
              "sitemap.xml"
            ),

          loadFeedsFn:
            async () => ({
              redirectRows: []
            })
        });
      } finally {
        cleanupDirectory(
          directory
        );
      }
    }
  );

  await expectAsyncThrow(
    "non-object feed result is rejected",
    async () => {
      const directory =
        makeTempDirectory();

      try {
        await writeLocationSitemap({
          outputPath:
            path.join(
              directory,
              "sitemap.xml"
            ),

          loadFeedsFn:
            async () => null
        });
      } finally {
        cleanupDirectory(
          directory
        );
      }
    }
  );

  await expectAsyncThrow(
    "invalid output directory is rejected",
    async () => {
      await writeLocationSitemap({
        outputPath:
          path.join(
            os.tmpdir(),
            "ils-nonexistent-directory",
            "sitemap.xml"
          ),

        loadFeedsFn:
          async () =>
            validFeeds()
      });
    }
  );

  console.log("");
  console.log(
    "=============================================="
  );
  console.log(
    "LOCATION SITEMAP WRITER TEST RESULT"
  );
  console.log(
    "=============================================="
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
      "LOCATION_SITEMAP_WRITER_TEST=FAIL"
    );

    process.exitCode = 1;
    return;
  }

  console.log(
    "LOCATION_SITEMAP_WRITER_TEST=PASS"
  );
}

main().catch(error => {
  console.error(
    "LOCATION_SITEMAP_WRITER_TEST=FAIL"
  );

  console.error(
    error.message
  );

  process.exitCode = 1;
});
