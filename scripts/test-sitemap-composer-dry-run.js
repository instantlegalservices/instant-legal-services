"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  sha256,
  auditComposedSitemap
} = require("./sitemap-composer-dry-run");

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
  try {
    await assert.rejects(fn);
    pass++;
    console.log(`PASS: ${name}`);
  } catch (error) {
    fail++;
    console.error(`FAIL: ${name}`);
    console.error(`      ${error.message}`);
  }
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
  /*
   * 1. SHA-256 determinism
   */
  test(
    "SHA-256 is deterministic",
    () => {
      const value =
        "ILS sitemap dry run";

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

  /*
   * 2. Valid dry-run
   *
   * Most important safety test:
   * source sitemap must remain byte-for-byte
   * unchanged.
   */
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

  /*
   * 3. Registry outage must fail closed.
   */
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

  /*
   * 4. Malformed existing sitemap must fail closed.
   */
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

  /*
   * 5. Invalid Registry feed must fail closed.
   */
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

  /*
   * 6. Historical/current collision must fail.
   */
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

  /*
   * 7. Current Registry routes must actually
   * appear in the prospective sitemap.
   */
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
        "Current Registry routes are present",
        async () => {
          const result =
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

          assert.strictEqual(
            result.inventory.currentMissing.length,
            0
          );

          assert.strictEqual(
            result.inventory.currentRoutesConfigured,
            1
          );
        }
      );
    } finally {
      cleanup(directory);
    }
  }

  /*
   * 8. Prospective sitemap independently validates.
   */
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

  /*
   * 9. Repeated dry-run must be deterministic.
   */
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

      assert.strictEqual(
        first.originalSha256,
        second.originalSha256
      );
    } finally {
      cleanup(directory);
    }
  }

  /*
   * 10. Dry-run must not create temp files.
   */
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
            [
              "sitemap.xml"
            ]
          );
        }
      );
    } finally {
      cleanup(directory);
    }
  }

  /*
   * 11. Dry-run must not import or invoke
   * the production writer.
   */
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

  /*
   * 12. File metadata/content must remain unchanged.
   */
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

  /*
   * 13. Missing sitemap must fail.
   */
  {
    const directory =
      makeTempDirectory();

    try {
      const sitemapPath =
        path.join(
          directory,
          "sitemap.xml"
        );

      await expectAsyncThrow(
        "Missing sitemap fails safely",
        async () => {
          await auditComposedSitemap({
            sitemapPath,

            loadFeedsFn:
              async () =>
                feeds()
          });
        }
      );

      assert.strictEqual(
        fs.existsSync(
          sitemapPath
        ),
        false
      );
    } finally {
      cleanup(directory);
    }
  }

  /*
   * 14. Wrong sitemap filename must fail.
   */
  {
    const directory =
      makeTempDirectory();

    try {
      const wrongPath =
        path.join(
          directory,
          "wrong.xml"
        );

      await expectAsyncThrow(
        "Wrong sitemap path is rejected",
        async () => {
          await auditComposedSitemap({
            sitemapPath:
              wrongPath,

            loadFeedsFn:
              async () =>
                feeds()
          });
        }
      );
    } finally {
      cleanup(directory);
    }
  }

  /*
   * 15. Symlink sitemap must be rejected.
   */
  {
    const directory =
      makeTempDirectory();

    try {
      const realPath =
        path.join(
          directory,
          "real-sitemap.xml"
        );

      const sitemapPath =
        path.join(
          directory,
          "sitemap.xml"
        );

      fs.writeFileSync(
        realPath,
        existingSitemap(),
        "utf8"
      );

      fs.symlinkSync(
        realPath,
        sitemapPath
      );

      await expectAsyncThrow(
        "Symlink sitemap is rejected",
        async () => {
          await auditComposedSitemap({
            sitemapPath,

            loadFeedsFn:
              async () =>
                feeds()
          });
        }
      );
    } finally {
      cleanup(directory);
    }
  }

  /*
   * 16. Feed object shape must be enforced.
   */
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
        "Invalid Registry loader result fails",
        async () => {
          await auditComposedSitemap({
            sitemapPath,

            loadFeedsFn:
              async () => ({
                currentRows:
                  []
              })
          });
        }
      );

      assert.strictEqual(
        fs.readFileSync(
          sitemapPath,
          "utf8"
        ),
        existingSitemap()
      );
    } finally {
      cleanup(directory);
    }
  }

  /*
   * 17. Empty valid Registry feed is allowed.
   */
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

      await asyncTest(
        "Empty Registry feed is handled safely",
        async () => {
          const result =
            await auditComposedSitemap({
              sitemapPath,

              loadFeedsFn:
                async () => ({
                  currentRows: [],
                  redirectRows: []
                })
            });

          assert.strictEqual(
            result.status,
            "PASS"
          );

          assert.strictEqual(
            result.inventory.currentRoutesConfigured,
            0
          );

          assert.strictEqual(
            result.inventory.historicalRoutesConfigured,
            0
          );

          assert.strictEqual(
            result.sourceUnchanged,
            true
          );
        }
      );
    } finally {
      cleanup(directory);
    }
  }

  /*
   * 18. Source sitemap must remain unchanged
   * even when composition result differs.
   */
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
        fs.readFileSync(
          sitemapPath
        );

      const result =
        await auditComposedSitemap({
          sitemapPath,

          loadFeedsFn:
            async () =>
              feeds()
        });

      const after =
        fs.readFileSync(
          sitemapPath
        );

      assert.notStrictEqual(
        result.originalSha256,
        result.composedSha256
      );

      assert.deepStrictEqual(
        after,
        before
      );
    } finally {
      cleanup(directory);
    }
  }

  /*
   * Final summary
   */
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
