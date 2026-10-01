/**
 * Instant Legal Services
 * Canonical Sitemap Composer Writer Adversarial Tests
 *
 * Tests:
 * - Existing static URLs are preserved.
 * - Current Registry routes are added.
 * - Historical routes are removed.
 * - Stale Registry metadata is replaced.
 * - Atomic replacement succeeds.
 * - Registry failure leaves sitemap untouched.
 * - Composer validation failure leaves sitemap untouched.
 * - Malformed existing sitemap leaves sitemap untouched.
 * - Temporary files are cleaned up.
 * - Symlink input/output is rejected.
 * - Final written XML is validated.
 */

"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  writeComposedSitemap,
  assertSitemapPath,
  createTemporaryPath
} = require("./sitemap-composer-writer");

const {
  validateComposedSitemap
} = require("./sitemap-composer");

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
      "ils-sitemap-composer-"
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

const VALID_ID_1 =
  "11111111-1111-4111-8111-111111111111";

const VALID_ID_2 =
  "22222222-2222-4222-8222-222222222222";

function makeCurrentRows() {
  return [
    {
      id:
        VALID_ID_1,

      location_type:
        "DISTRICT",

      canonical_name:
        "Bareilly",

      canonical_slug:
        "bareilly",

      current_route:
        "/bareilly/"
    },

    {
      id:
        VALID_ID_2,

      location_type:
        "TEHSIL",

      canonical_name:
        "Aonla",

      canonical_slug:
        "aonla",

      current_route:
        "/tehsil/aonla/"
    }
  ];
}

function makeRedirectRows() {
  return [
    {
      location_id:
        VALID_ID_1,

      route:
        "/bareilly-old/",

      redirect_to:
        "/bareilly/"
    }
  ];
}

/**
 * This sitemap deliberately contains:
 *
 * 1. static URL
 * 2. another static URL
 * 3. historical location URL
 * 4. stale current Registry URL
 *
 * The final composed sitemap must:
 * - preserve #1
 * - preserve #2
 * - remove #3
 * - replace #4 with the current Registry route
 * - add Aonla
 */
function makeExistingSitemap() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://instantlegalservices.in/</loc>
  </url>

  <url>
    <loc>https://instantlegalservices.in/about.html</loc>
  </url>

  <url>
    <loc>https://instantlegalservices.in/bareilly-old/</loc>
  </url>

  <url>
    <loc>https://instantlegalservices.in/bareilly/</loc>
    <lastmod>2020-01-01</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.1</priority>
  </url>
</urlset>
`;
}

function validFeeds() {
  return {
    currentRows:
      makeCurrentRows(),

    redirectRows:
      makeRedirectRows()
  };
}

async function main() {
  test(
    "sitemap path must target sitemap.xml",
    () => {
      assert.throws(
        () =>
          assertSitemapPath(
            "/tmp/not-sitemap.xml.backup"
          )
      );
    }
  );

  test(
    "sitemap path is resolved safely",
    () => {
      const resolved =
        assertSitemapPath(
          "./sitemap.xml"
        );

      assert.ok(
        path.isAbsolute(
          resolved
        )
      );

      assert.strictEqual(
        path.basename(
          resolved
        ),
        "sitemap.xml"
      );
    }
  );

  test(
    "temporary path stays in same directory",
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
      const sitemapPath =
        path.join(
          directory,
          "sitemap.xml"
        );

      const existingXml =
        makeExistingSitemap();

      fs.writeFileSync(
        sitemapPath,
        existingXml,
        "utf8"
      );

      const result =
        await writeComposedSitemap({
          inputPath:
            sitemapPath,

          outputPath:
            sitemapPath,

          loadFeedsFn:
            async () =>
              validFeeds()
        });

      assert.strictEqual(
        result.status,
        "PASS"
      );

      assert.strictEqual(
        result.existingCount,
        4
      );

      assert.strictEqual(
        result.currentLocationCount,
        2
      );

      assert.strictEqual(
        result.historicalRoutesExcluded,
        1
      );

      assert.strictEqual(
        result.duplicateCurrentRoutesReplaced,
        1
      );

      assert.strictEqual(
        result.finalCount,
        4
      );

      assert.strictEqual(
        result.atomicReplacement,
        true
      );

      assert.ok(
        result.bytes > 0
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
      const sitemapPath =
        path.join(
          directory,
          "sitemap.xml"
        );

      fs.writeFileSync(
        sitemapPath,
        makeExistingSitemap(),
        "utf8"
      );

      await asyncTest(
        "static root URL is preserved",
        async () => {
          const result =
            await writeComposedSitemap({
              inputPath:
                sitemapPath,

              outputPath:
                sitemapPath,

              loadFeedsFn:
                async () =>
                  validFeeds()
            });

          assert.strictEqual(
            result.status,
            "PASS"
          );

          const xml =
            await fs.promises.readFile(
              sitemapPath,
              "utf8"
            );

          assert.ok(
            xml.includes(
              "https://instantlegalservices.in/"
            )
          );
        }
      );

      await asyncTest(
        "static about URL is preserved",
        async () => {
          const xml =
            await fs.promises.readFile(
              sitemapPath,
              "utf8"
            );

          assert.ok(
            xml.includes(
              "https://instantlegalservices.in/about.html"
            )
          );
        }
      );

      await asyncTest(
        "current district route exists",
        async () => {
          const xml =
            await fs.promises.readFile(
              sitemapPath,
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
        "current tehsil route exists",
        async () => {
          const xml =
            await fs.promises.readFile(
              sitemapPath,
              "utf8"
            );

          assert.ok(
            xml.includes(
              "https://instantlegalservices.in/tehsil/aonla/"
            )
          );
        }
      );

      await asyncTest(
        "historical route is excluded",
        async () => {
          const xml =
            await fs.promises.readFile(
              sitemapPath,
              "utf8"
            );

          assert.ok(
            !xml.includes(
              "/bareilly-old/"
            )
          );
        }
      );

      await asyncTest(
        "stale Registry metadata is removed",
        async () => {
          const xml =
            await fs.promises.readFile(
              sitemapPath,
              "utf8"
            );

          assert.ok(
            xml.includes(
              "<loc>https://instantlegalservices.in/bareilly/</loc>"
            )
          );

          /*
           * The old Registry-owned metadata must
           * not survive composition.
           */
          assert.ok(
            !xml.includes(
              "<lastmod>2020-01-01</lastmod>"
            )
          );

          assert.ok(
            !xml.includes(
              "<changefreq>monthly</changefreq>"
            )
          );

          assert.ok(
            !xml.includes(
              "<priority>0.1</priority>"
            )
          );
        }
      );

      await asyncTest(
        "final sitemap passes independent validation",
        async () => {
          const xml =
            await fs.promises.readFile(
              sitemapPath,
              "utf8"
            );

          assert.strictEqual(
            validateComposedSitemap(
              xml
            ),
            true
          );
        }
      );

      await asyncTest(
        "temporary files are cleaned up",
        async () => {
          const files =
            await fs.promises.readdir(
              directory
            );

          assert.deepStrictEqual(
            files.filter(
              file =>
                file.endsWith(
                  ".tmp"
                )
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
      const sitemapPath =
        path.join(
          directory,
          "sitemap.xml"
        );

      const originalXml =
        makeExistingSitemap();

      fs.writeFileSync(
        sitemapPath,
        originalXml,
        "utf8"
      );

      await expectAsyncThrow(
        "Registry failure leaves existing sitemap untouched",
        async () => {
          await writeComposedSitemap({
            inputPath:
              sitemapPath,

            outputPath:
              sitemapPath,

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
        await fs.promises.readFile(
          sitemapPath,
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
      const sitemapPath =
        path.join(
          directory,
          "sitemap.xml"
        );

      const originalXml =
        makeExistingSitemap();

      fs.writeFileSync(
        sitemapPath,
        originalXml,
        "utf8"
      );

      await expectAsyncThrow(
        "invalid Registry data leaves existing sitemap untouched",
        async () => {
          await writeComposedSitemap({
            inputPath:
              sitemapPath,

            outputPath:
              sitemapPath,

            loadFeedsFn:
              async () => ({
                currentRows: [
                  {
                    id:
                      VALID_ID_1,

                    location_type:
                      "DISTRICT",

                    canonical_name:
                      "Bareilly",

                    canonical_slug:
                      "Bareilly",

                    current_route:
                      "/bareilly/"
                  }
                ],

                redirectRows: []
              })
          });
        }
      );

      const afterFailure =
        await fs.promises.readFile(
          sitemapPath,
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
      const sitemapPath =
        path.join(
          directory,
          "sitemap.xml"
        );

      const originalXml =
        makeExistingSitemap();

      fs.writeFileSync(
        sitemapPath,
        originalXml,
        "utf8"
      );

      const malformedXml =
        `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://instantlegalservices.in/</loc>
  </url>
  BROKEN-CONTENT
</urlset>
`;

      fs.writeFileSync(
        sitemapPath,
        malformedXml,
        "utf8"
      );

      await expectAsyncThrow(
        "malformed existing sitemap is rejected",
        async () => {
          await writeComposedSitemap({
            inputPath:
              sitemapPath,

            outputPath:
              sitemapPath,

            loadFeedsFn:
              async () =>
                validFeeds()
          });
        }
      );

      const afterFailure =
        await fs.promises.readFile(
          sitemapPath,
          "utf8"
        );

      assert.strictEqual(
        afterFailure,
        malformedXml
      );

      /*
       * Confirm the failed operation did not
       * silently replace the malformed source.
       */
      assert.notStrictEqual(
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
      const sitemapPath =
        path.join(
          directory,
          "sitemap.xml"
        );

      fs.writeFileSync(
        sitemapPath,
        makeExistingSitemap(),
        "utf8"
      );

      const symlinkPath =
        path.join(
          directory,
          "linked-sitemap.xml"
        );

      /*
       * The helper intentionally requires basename
       * sitemap.xml, therefore create the symlink
       * inside another directory.
       */
      const symlinkDirectory =
        path.join(
          directory,
          "symlink-target"
        );

      fs.mkdirSync(
        symlinkDirectory
      );

      const linkedSitemap =
        path.join(
          symlinkDirectory,
          "sitemap.xml"
        );

      fs.symlinkSync(
        sitemapPath,
        linkedSitemap
      );

      await expectAsyncThrow(
        "symlink input is rejected",
        async () => {
          await writeComposedSitemap({
            inputPath:
              linkedSitemap,

            outputPath:
              linkedSitemap,

            loadFeedsFn:
              async () =>
                validFeeds()
          });
        }
      );

      /*
       * Keep the variable intentionally referenced
       * so linting/static analysis does not treat the
       * test fixture as accidental.
       */
      assert.ok(
        symlinkPath.endsWith(
          "linked-sitemap.xml"
        )
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
      const realDirectory =
        path.join(
          directory,
          "real"
        );

      const linkDirectory =
        path.join(
          directory,
          "link"
        );

      fs.mkdirSync(
        realDirectory
      );

      fs.mkdirSync(
        linkDirectory
      );

      const realSitemap =
        path.join(
          realDirectory,
          "sitemap.xml"
        );

      fs.writeFileSync(
        realSitemap,
        makeExistingSitemap(),
        "utf8"
      );

      const linkedOutput =
        path.join(
          linkDirectory,
          "sitemap.xml"
        );

      fs.symlinkSync(
        realSitemap,
        linkedOutput
      );

      await expectAsyncThrow(
        "symlink output is rejected",
        async () => {
          await writeComposedSitemap({
            inputPath:
              realSitemap,

            outputPath:
              linkedOutput,

            loadFeedsFn:
              async () =>
                validFeeds()
          });
        }
      );

      const original =
        await fs.promises.readFile(
          realSitemap,
          "utf8"
        );

      assert.strictEqual(
        original,
        makeExistingSitemap()
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
      await expectAsyncThrow(
        "missing output directory is rejected",
        async () => {
          await writeComposedSitemap({
            inputPath:
              path.join(
                directory,
                "missing",
                "sitemap.xml"
              ),

            outputPath:
              path.join(
                directory,
                "missing",
                "sitemap.xml"
              ),

            loadFeedsFn:
              async () =>
                validFeeds()
          });
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
      const inputPath =
        path.join(
          directory,
          "sitemap.xml"
        );

      const outputDirectory =
        path.join(
          directory,
          "output"
        );

      fs.mkdirSync(
        outputDirectory
      );

      const outputPath =
        path.join(
          outputDirectory,
          "sitemap.xml"
        );

      fs.writeFileSync(
        inputPath,
        makeExistingSitemap(),
        "utf8"
      );

      const result =
        await writeComposedSitemap({
          inputPath,
          outputPath,

          loadFeedsFn:
            async () =>
              validFeeds()
        });

      assert.strictEqual(
        result.status,
        "PASS"
      );

      const inputXml =
        await fs.promises.readFile(
          inputPath,
          "utf8"
        );

      const outputXml =
        await fs.promises.readFile(
          outputPath,
          "utf8"
        );

      /*
       * Source remains unchanged when using
       * a separate output path.
       */
      assert.strictEqual(
        inputXml,
        makeExistingSitemap()
      );

      assert.notStrictEqual(
        outputXml,
        inputXml
      );

      assert.strictEqual(
        validateComposedSitemap(
          outputXml
        ),
        true
      );
    } finally {
      cleanupDirectory(
        directory
      );
    }
  }

  console.log("");
  console.log(
    "========================================"
  );
  console.log(
    "SITEMAP COMPOSER WRITER TEST SUMMARY"
  );
  console.log(
    "========================================"
  );
  console.log(
    `PASS: ${pass}`
  );
  console.log(
    `FAIL: ${fail}`
  );

  if (
    fail > 0
  ) {
    console.error(
      "SITEMAP_COMPOSER_WRITER_TEST=FAIL"
    );

    process.exitCode = 1;
    return;
  }

  console.log(
    "SITEMAP_COMPOSER_WRITER_TEST=PASS"
  );
}

main()
  .catch(error => {
    console.error(
      "SITEMAP_COMPOSER_WRITER_TEST=FAIL"
    );

    console.error(
      error.stack ||
      error.message
    );

    process.exitCode = 1;
  });
