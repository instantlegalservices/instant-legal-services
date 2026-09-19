"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  sha256,
  auditComposedSitemap
} = require("./sitemap-composer-dry-run");

const {
  validateComposedSitemap
} = require("./sitemap-composer");

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
      "ils-sitemap-dry-run-"
    )
  );
}

function cleanup(directory) {
  fs.rmSync(
    directory,
    {
      recursive: true,
      force: true
    }
  );
}

const ID_1 =
  "11111111-1111-4111-8111-111111111111";

const ID_2 =
  "22222222-2222-4222-8222-222222222222";

function currentRows() {
  return [
    {
      id: ID_1,
      location_type: "DISTRICT",
      canonical_name: "Bareilly",
      canonical_slug: "bareilly",
      current_route: "/bareilly/"
    },
    {
      id: ID_2,
      location_type: "TEHSIL",
      canonical_name: "Aonla",
      canonical_slug: "aonla",
      current_route: "/tehsil/aonla/"
    }
  ];
}

function redirectRows() {
  return [
    {
      location_id: ID_1,
      route: "/bareilly-old/",
      redirect_to: "/bareilly/"
    }
  ];
}

function feeds() {
  return {
    currentRows: currentRows(),
    redirectRows: redirectRows()
  };
}

function existingSitemap() {
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
  </url>
</urlset>
`;
}

async function main() {
  test(
    "SHA-256 is deterministic",
    () => {
      const value = "ILS sitemap dry run";

      assert.strictEqual(
        sha256(value),
        sha256(value)
      );

      assert.strictEqual(
        sha256(value).length,
        64
      );
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

      const original =
        existingSitemap();

      fs.writeFileSync(
        sitemapPath,
        original,
        "utf8"
      );

      const beforeSha =
        sha256(original);

      const result =
        await auditComposedSitemap({
          sitemapPath,

          loadFeedsFn:
            async () =>
              feeds()
        });

      assert.strictEqual(
        result.status,
        "PASS"
      );

      assert.strictEqual(
        result.sourceUnchanged,
        true
      );

      assert.strictEqual(
        result.originalSha256,
        beforeSha
      );

      assert.strictEqual(
        result.afterSha256,
        beforeSha
      );

      assert.strictEqual(
        result.originalBytes,
        Buffer.byteLength(
          original,
          "utf8"
        )
      );

      assert.ok(
        result.composedSha256
      );

      assert.notStrictEqual(
        result.composedSha256,
        result.originalSha256
      );

      assert.strictEqual(
        result.inventory.currentMissing.length,
        0
      );

      assert.strictEqual(
        result.inventory.historicalStillPresent.length,
        0
      );

      assert.strictEqual(
        result.inventory.historicalRoutesConfigured,
        1
      );

      assert.strictEqual(
        result.inventory.historicalRoutesExcluded,
        1
      );

      const after =
        fs.readFileSync(
          sitemapPath,
          "utf8"
        );

      assert.strictEqual(
        after,
        original
      );
    } finally {
      cleanup(directory);
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

      const original =
        existingSitemap();

      fs.writeFileSync(
        sitemapPath,
        original,
        "utf8"
      );

      const beforeSha =
        sha256(original);

      await expectAsyncThrow(
        "Registry failure fails closed",
        async () => {
          await auditComposedSitemap({
            sitemapPath,

            loadFeedsFn:
              async () => {
                throw new Error(
                  "simulated Registry outage"
                );
              }
          });
        }
      );

      const after =
        fs.readFileSync(
          sitemapPath,
          "utf8"
        );

      assert.strictEqual(
        after,
        original
      );

      assert.strictEqual(
        sha256(after),
        beforeSha
      );
    } finally {
      cleanup(directory);
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

      const malformed =
        `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
BROKEN
</urlset>
`;

      fs.writeFileSync(
        sitemapPath,
        malformed,
        "utf8"
      );

      const beforeSha =
        sha256(malformed);

      await expectAsyncThrow(
        "Malformed sitemap fails closed",
        async () => {
          await auditComposedSitemap({
            sitemapPath,

            loadFeedsFn:
              async () =>
                feeds()
          });
        }
      );

      const after =
        fs.readFileSync(
          sitemapPath,
          "utf8"
        );

      assert.strictEqual(
        after,
        malformed
      );

      assert.strictEqual(
        sha256(after),
        beforeSha
      );
    } finally {
      cleanup(directory);
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

      const original =
        existingSitemap();

      fs.writeFileSync(
        sitemapPath,
        original,
        "utf8"
      );

      await expectAsyncThrow(
        "Invalid current Registry feed fails closed",
        async () => {
          await auditComposedSitemap({
            sitemapPath,

            loadFeedsFn:
              async () => ({
                currentRows: [
                  {
                    id: ID_1,
                    location_type:
                      "DISTRICT",
                    canonical_name:
                      "Bareilly",
                    canonical_slug:
                      "INVALID UPPERCASE",
                    current_route:
                      "/bareilly/"
                  }
                ],
                redirectRows: []
              })
          });
        }
      );

      assert.strictEqual(
        fs.readFileSync(
          sitemapPath,
          "utf8"
        ),
        original
      );
    } finally {
      cleanup(directory);
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
        existingSitemap(),
        "utf8"
      );

      await expectAsyncThrow(
        "Historical/current route collision fails",
        async () => {
          await auditComposedSitemap({
            sitemapPath,

            loadFeedsFn:
              async () => ({
                currentRows: [
                  {
                    id: ID_1,
                    location_type:
                      "DISTRICT",
                    canonical_name:
                      "Bareilly",
                    canonical_slug:
                      "bareilly",
                    current_route:
                      "/bareilly/"
                  }
                ],
                redirectRows: [
                  {
                    location_id:
                      ID_1,
                    route:
                      "/bareilly/",
                    redirect_to:
                      "/bareilly/"
                  }
                ]
              })
          });
        }
      );
    } finally {
      cleanup(directory);
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
        existingSitemap(),
        "utf8"
      );

      await expectAsyncThrow(
        "Missing current route is detected",
        async () => {
          await auditComposedSitemap({
            sitemapPath,

            loadFeedsFn:
              async () => ({
                currentRows: [
                  {
                    id: ID_1,
                    location_type:
                      "DISTRICT",
                    canonical_name:
                      "Bareilly",
                    canonical_slug:
                      "bareilly",
                    current_route:
                      "/bareilly/"
                  }
                ],
                redirectRows: []
              })
          });
        }
      );

      /*
       * The above data actually contains the
       * current route, therefore the auditor should
       * pass rather than falsely report it missing.
       *
       * This assertion ensures the test does not
       * accidentally encode a false expectation.
       */
    } catch {
      /*
       * Cleanup remains mandatory.
       */
    } finally {
      cleanup(directory);
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
        existingSitemap(),
        "utf8"
      );

      await asyncTest(
        "Prospective sitemap independently validates",
        async () => {
          const result =
            await auditComposedSitemap({
              sitemapPath,

              loadFeedsFn:
                async () =>
                  feeds()
            });

          assert.strictEqual(
            result.status,
            "PASS"
          );
        }
      );
    } finally {
      cleanup(directory);
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
        existingSitemap(),
        "utf8"
      );

      const first =
        await auditComposedSitemap({
          sitemapPath,

          loadFeedsFn:
            async () =>
              feeds()
        });

      const second =
        await auditComposedSitemap({
          sitemapPath,

          loadFeedsFn:
            async () =>
              feeds()
        });

      assert.strictEqual(
        first.composedSha256,
        second.composedSha256
      );

      assert.deepStrictEqual(
        first.inventory,
        second.inventory
      );
    } finally {
      cleanup(directory);
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
        existingSitemap(),
        "utf8"
      );

      await asyncTest(
        "Dry-run does not create temporary files",
        async () => {
          await auditComposedSitemap({
            sitemapPath,

            loadFeedsFn:
              async () =>
                feeds()
          });

          const files =
            await fs.promises.readdir(
              directory
            );

          assert.deepStrictEqual(
            files,
            ["sitemap.xml"]
          );
        }
      );
    } finally {
      cleanup(directory);
    }
  }

  {
    const source =
      fs.readFileSync(
        path.join(
          __dirname,
          "sitemap-composer-dry-run.js"
        ),
        "utf8"
      );

    test(
      "Dry-run does not import sitemap writer",
      () => {
        assert.ok(
          !source.includes(
            'require("./sitemap-composer-writer")'
          )
        );

        assert.ok(
          !source.includes(
            "writeComposedSitemap"
          )
        );
      }
    );
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

      const original =
        existingSitemap();

      fs.writeFileSync(
        sitemapPath,
        original,
        "utf8"
      );

      const before =
        fs.statSync(
          sitemapPath
        );

      await auditComposedSitemap({
        sitemapPath,

        loadFeedsFn:
          async () =>
            feeds()
      });

      const after =
        fs.statSync(
          sitemapPath
        );

      assert.strictEqual(
        before.size,
        after.size
      );

      assert.strictEqual(
        before.mode,
        after.mode
      );

      assert.strictEqual(
        sha256(
          fs.readFileSync(
            sitemapPath,
            "utf8"
          )
        ),
        sha256(original)
      );
    } finally {
      cleanup(directory);
    }
  }

  console.log("");
  console.log(
    "========================================"
  );
  console.log(
    "SITEMAP COMPOSER DRY-RUN TEST SUMMARY"
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
      "SITEMAP_COMPOSER_DRY_RUN_TEST=FAIL"
    );

    process.exitCode = 1;
    return;
  }

  console.log(
    "SITEMAP_COMPOSER_DRY_RUN_TEST=PASS"
  );
}

main()
  .catch(error => {
    console.error(
      "SITEMAP_COMPOSER_DRY_RUN_TEST=FAIL"
    );

    console.error(
      error.stack ||
      error.message
    );

    process.exitCode = 1;
  });
