/**
 * Instant Legal Services
 * Migration -> Sitemap Composer Integration Test
 *
 * Contract:
 * Registry/current manifest
 *      ->
 * Migration Engine
 *      ->
 * Migration result
 *      ->
 * Sitemap Composer
 *
 * Verifies:
 * - migrated current route enters sitemap
 * - previous route becomes redirect metadata
 * - historical route is excluded
 * - redirect target remains current
 * - existing static sitemap URLs survive
 * - no duplicate sitemap URLs
 * - deterministic output
 * - final sitemap validates
 * - invalid migration cannot silently enter sitemap
 */

"use strict";

const assert = require("assert");

const {
  migrateLocations,
  ACTIVE_STATUS
} = require("./location-migration");

const {
  composeSitemap,
  parseSitemap,
  validateComposedSitemap
} = require("./sitemap-composer");

const DISTRICT_ID =
  "11111111-1111-4111-8111-111111111111";

const TEHSIL_ID =
  "22222222-2222-4222-8222-222222222222";

const BASE_MANIFEST = [
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
      "migration-sitemap-integration-v1"
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
      "migration-sitemap-integration-v1"
  }
];

const BASE_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://instantlegalservices.in/</loc>
  </url>
  <url>
    <loc>https://instantlegalservices.in/about.html</loc>
  </url>
  <url>
    <loc>https://instantlegalservices.in/district/bareilly/</loc>
  </url>
</urlset>
`;

function test(
  name,
  fn
) {
  try {
    fn();

    console.log(
      `PASS: ${name}`
    );

    return true;
  } catch (error) {
    console.error(
      `FAIL: ${name}`
    );

    console.error(
      `      ${error.message}`
    );

    return false;
  }
}

function expectThrow(
  name,
  fn
) {
  return test(
    name,
    () => {
      assert.throws(fn);
    }
  );
}

function runMigration() {
  return migrateLocations(
    BASE_MANIFEST,
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
        "migration-sitemap-integration-v1"
    }
  );
}

/*
 * Convert the final migration manifest into
 * the exact current Registry feed contract
 * expected by sitemap-composer.
 */
function buildCurrentFeed(
  migratedManifest
) {
  return migratedManifest.map(
    entry => {
      const segments =
        entry.route
          .split("/")
          .filter(Boolean);

      const canonicalSlug =
        segments[
          segments.length - 1
        ];

      const canonicalName =
        canonicalSlug
          .split("-")
          .map(
            word =>
              word.charAt(0)
                .toUpperCase() +
              word.slice(1)
          )
          .join(" ");

      return {
        id:
          entry.sourceId,

        location_type:
          entry.locationType,

        canonical_name:
          canonicalName,

        canonical_slug:
          canonicalSlug,

        current_route:
          entry.route
      };
    }
  );
}

/*
 * Convert migration redirects into the exact
 * historical Registry redirect feed contract.
 */
function buildRedirectFeed(
  redirects
) {
  return redirects.map(
    redirect => ({
      location_id:
        redirect.sourceId,

      route:
        redirect.from,

      redirect_to:
        redirect.to
    })
  );
}

function main() {
  let pass = 0;
  let fail = 0;

  function run(
    name,
    fn
  ) {
    if (
      test(
        name,
        fn
      )
    ) {
      pass++;
    } else {
      fail++;
    }
  }

  /*
   * -------------------------------------------------
   * 1. MIGRATION CONTRACT
   * -------------------------------------------------
   */

  const migration =
    runMigration();

  run(
    "migration completes with PASS summary",
    () => {
      assert.strictEqual(
        migration.summary.status,
        "PASS"
      );
    }
  );

  run(
    "district receives new current route",
    () => {
      const district =
        migration.migratedManifest.find(
          entry =>
            entry.sourceId ===
            DISTRICT_ID
        );

      assert.strictEqual(
        district.route,
        "/uttar-pradesh/bareilly/"
      );
    }
  );

  run(
    "previous route is preserved",
    () => {
      const district =
        migration.migratedManifest.find(
          entry =>
            entry.sourceId ===
            DISTRICT_ID
        );

      assert.deepStrictEqual(
        district.previousRoutes,
        [
          "/district/bareilly/"
        ]
      );
    }
  );

  run(
    "migration creates exact direct redirect",
    () => {
      assert.deepStrictEqual(
        migration.redirects,
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

  /*
   * -------------------------------------------------
   * 2. FEED BOUNDARY
   * -------------------------------------------------
   */

  const currentFeed =
    buildCurrentFeed(
      migration.migratedManifest
    );

  const redirectFeed =
    buildRedirectFeed(
      migration.redirects
    );

  run(
    "final manifest converts to valid current Registry feed",
    () => {
      assert.strictEqual(
        currentFeed.length,
        2
      );

      assert.strictEqual(
        currentFeed.find(
          row =>
            row.id ===
            DISTRICT_ID
        ).current_route,
        "/uttar-pradesh/bareilly/"
      );
    }
  );

  run(
    "migration redirect converts to historical Registry feed",
    () => {
      assert.deepStrictEqual(
        redirectFeed,
        [
          {
            location_id:
              DISTRICT_ID,

            route:
              "/district/bareilly/",

            redirect_to:
              "/uttar-pradesh/bareilly/"
          }
        ]
      );
    }
  );

  /*
   * -------------------------------------------------
   * 3. SITEMAP COMPOSER
   * -------------------------------------------------
   */

  const composed =
    composeSitemap(
      BASE_SITEMAP,
      currentFeed,
      redirectFeed
    );

  run(
    "composer returns valid sitemap XML",
    () => {
      assert.strictEqual(
        validateComposedSitemap(
          composed.xml
        ),
        true
      );
    }
  );

  const entries =
    parseSitemap(
      composed.xml
    );

  const urls =
    entries.map(
      entry =>
        entry.loc
    );

  run(
    "new migrated district route is in sitemap",
    () => {
      assert.ok(
        urls.includes(
          "https://instantlegalservices.in/uttar-pradesh/bareilly/"
        )
      );
    }
  );

  run(
    "historical district route is excluded",
    () => {
      assert.ok(
        !urls.includes(
          "https://instantlegalservices.in/district/bareilly/"
        )
      );

      assert.strictEqual(
        composed.historicalRoutesExcluded,
        1
      );
    }
  );

  run(
    "redirect target remains a current sitemap route",
    () => {
      assert.ok(
        urls.includes(
          "https://instantlegalservices.in/uttar-pradesh/bareilly/"
        )
      );

      assert.ok(
        !urls.includes(
          "https://instantlegalservices.in/district/bareilly/"
        )
      );
    }
  );

  run(
    "existing static URLs are preserved",
    () => {
      assert.ok(
        urls.includes(
          "https://instantlegalservices.in/"
        )
      );

      assert.ok(
        urls.includes(
          "https://instantlegalservices.in/about.html"
        )
      );
    }
  );

  run(
    "final sitemap contains no duplicate URLs",
    () => {
      assert.strictEqual(
        new Set(urls).size,
        urls.length
      );
    }
  );

  run(
    "final sitemap is deterministically sorted",
    () => {
      const sorted =
        [...urls].sort(
          (a, b) =>
            a.localeCompare(b)
        );

      assert.deepStrictEqual(
        urls,
        sorted
      );
    }
  );

  /*
   * -------------------------------------------------
   * 4. NEGATIVE BOUNDARY
   * -------------------------------------------------
   */

  expectThrow(
    "historical route cannot simultaneously be current",
    () => {
      composeSitemap(
        BASE_SITEMAP,
        currentFeed,
        [
          {
            location_id:
              DISTRICT_ID,

            route:
              "/uttar-pradesh/bareilly/",

            redirect_to:
              "/tehsil/aonla/"
          }
        ]
      );
    }
  )
    ? pass++
    : fail++;

  /*
   * The composer must reject a Registry current
   * feed that would violate its route contract.
   */
  expectThrow(
    "invalid migrated current route is rejected",
    () => {
      composeSitemap(
        BASE_SITEMAP,
        [
          {
            id:
              DISTRICT_ID,

            location_type:
              "TEHSIL",

            canonical_name:
              "Bareilly",

            canonical_slug:
              "bareilly",

            current_route:
              "/uttar-pradesh/bareilly/"
          }
        ],
        []
      );
    }
  )
    ? pass++
    : fail++;

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
    "LOCATION MIGRATION SITEMAP INTEGRATION TEST RESULT"
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

  if (
    fail !== 0
  ) {
    console.log(
      "LOCATION_MIGRATION_SITEMAP_INTEGRATION_TEST=FAIL"
    );

    process.exitCode = 1;
    return;
  }

  console.log(
    "LOCATION_MIGRATION_SITEMAP_INTEGRATION_TEST=PASS"
  );
}

main();
