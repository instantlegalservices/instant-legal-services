/**
 * Instant Legal Services
 * Location Registry -> Migration -> Sitemap
 * Integration Contract Test
 *
 * Purpose:
 * - Registry feed -> migration manifest
 * - migration -> redirect
 * - migration -> current sitemap route
 * - historical route exclusion
 * - rollback verification
 *
 * Safety:
 * - No DB
 * - No network
 * - No filesystem writes
 * - No Git operations
 */

"use strict";

const assert = require("node:assert/strict");

const {
  validateCurrentFeed
} = require("./location-registry-feed");

const {
  validateRows,
  generateLocationSitemap,
  validateGeneratedSitemap
} = require("./location-sitemap");

const {
  ACTIVE_STATUS,
  REDIRECT_STATUS,
  normalizeManifestEntry,
  migrateLocations,
  rollbackMigration,
  serializeRedirects
} = require("./location-migration");

const UUID_STATE =
  "550e8400-e29b-41d4-a716-446655440000";

const UUID_DISTRICT =
  "6ba7b810-9dad-51d1-80b4-00c04fd430c8";

const UUID_TEHSIL =
  "6ba7b811-9dad-51d1-80b4-00c04fd430c8";

let passed = 0;
let failed = 0;

function pass(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL: ${name}`);
    console.error(error.stack || error.message);
  }
}

function expectFail(name, fn) {
  try {
    fn();
    failed++;
    console.error(
      `FAIL: ${name}: expected failure`
    );
  } catch {
    passed++;
    console.log(`PASS: ${name}`);
  }
}

function registryFixture() {
  return [
    {
      id: UUID_STATE,
      location_type: "STATE",
      canonical_name: "Uttar Pradesh",
      canonical_slug: "uttar-pradesh",
      current_route: "/state/uttar-pradesh/"
    },

    {
      id: UUID_DISTRICT,
      location_type: "DISTRICT",
      canonical_name: "Bareilly",
      canonical_slug: "bareilly",
      current_route: "/district/bareilly/"
    },

    {
      id: UUID_TEHSIL,
      location_type: "TEHSIL",
      canonical_name: "Bareilly",
      canonical_slug: "bareilly",
      current_route: "/tehsil/bareilly/"
    }
  ];
}

function registryToManifest(rows) {
  return rows.map(row =>
    normalizeManifestEntry({
      sourceId: row.id,
      locationType: row.location_type,
      route: row.current_route,
      canonical: row.current_route,
      previousRoutes: [],
      status: ACTIVE_STATUS,
      generatorVersion:
        "registry-migration-integration-v1"
    })
  );
}

function manifestToSitemapRows(
  manifest,
  registryRows
) {
  const registryById = new Map(
    registryRows.map(row => [
      row.id,
      row
    ])
  );

  return manifest.map(entry => {
    const registry =
      registryById.get(entry.sourceId);

    if (!registry) {
      throw new Error(
        `Missing Registry identity: ${entry.sourceId}`
      );
    }

    const segments =
      entry.route
        .split("/")
        .filter(Boolean);

    const canonicalSlug =
      segments[segments.length - 1];

    return {
      id: entry.sourceId,

      location_type:
        entry.locationType,

      canonical_name:
        registry.canonical_name,

      canonical_slug:
        canonicalSlug,

      current_route:
        entry.route
    };
  });
}

function main() {
  /*
   * ------------------------------------------------------------
   * 1. Registry validation
   * ------------------------------------------------------------
   */

  const registryRows =
    validateCurrentFeed(
      registryFixture()
    );

  pass(
    "Registry feed validates before migration",
    () => {
      assert.equal(
        registryRows.length,
        3
      );
    }
  );

  /*
   * ------------------------------------------------------------
   * 2. Registry -> Migration identity
   * ------------------------------------------------------------
   */

  const originalManifest =
    registryToManifest(
      registryRows
    );

  pass(
    "Registry IDs become stable migration sourceIds",
    () => {
      assert.deepEqual(
        originalManifest
          .map(row => row.sourceId)
          .sort(),

        registryRows
          .map(row => row.id)
          .sort()
      );
    }
  );

  /*
   * ------------------------------------------------------------
   * 3. Existing Registry manifest remains valid
   * ------------------------------------------------------------
   */

  pass(
    "Registry manifest passes migration engine",
    () => {
      const result =
        migrateLocations(
          originalManifest,
          []
        );

      assert.equal(
        result.migratedManifest.length,
        originalManifest.length
      );

      assert.equal(
        result.summary.status,
        "PASS"
      );
    }
  );

  /*
   * ------------------------------------------------------------
   * 4. Genuine District migration
   * ------------------------------------------------------------
   */

  const migrationResult =
    migrateLocations(
      originalManifest,
      [
        {
          sourceId:
            UUID_DISTRICT,

          locationType:
            "DISTRICT",

          newRoute:
            "/uttar-pradesh/bareilly/"
        }
      ]
    );

  pass(
    "District route migrates to hierarchical route",
    () => {
      const district =
        migrationResult.migratedManifest.find(
          entry =>
            entry.sourceId ===
            UUID_DISTRICT
        );

      assert.ok(district);

      assert.equal(
        district.route,
        "/uttar-pradesh/bareilly/"
      );

      assert.equal(
        district.canonical,
        "/uttar-pradesh/bareilly/"
      );

      assert.deepEqual(
        district.previousRoutes,
        [
          "/district/bareilly/"
        ]
      );

      assert.equal(
        district.status,
        ACTIVE_STATUS
      );
    }
  );

  /*
   * ------------------------------------------------------------
   * 5. Redirect contract
   * ------------------------------------------------------------
   */

  pass(
    "Migration creates exact direct redirect",
    () => {
      assert.equal(
        migrationResult.redirects.length,
        1
      );

      const redirect =
        migrationResult.redirects[0];

      assert.equal(
        redirect.sourceId,
        UUID_DISTRICT
      );

      assert.equal(
        redirect.locationType,
        "DISTRICT"
      );

      assert.equal(
        redirect.from,
        "/district/bareilly/"
      );

      assert.equal(
        redirect.to,
        "/uttar-pradesh/bareilly/"
      );

      assert.equal(
        redirect.status,
        REDIRECT_STATUS
      );

      assert.notEqual(
        redirect.from,
        redirect.to
      );
    }
  );

  /*
   * ------------------------------------------------------------
   * 6. Sitemap candidate isolation
   * ------------------------------------------------------------
   */

  pass(
    "Sitemap candidates contain current routes only",
    () => {
      assert.ok(
        migrationResult.sitemapRoutes.includes(
          "/uttar-pradesh/bareilly/"
        )
      );

      assert.ok(
        !migrationResult.sitemapRoutes.includes(
          "/district/bareilly/"
        )
      );
    }
  );

  /*
   * ------------------------------------------------------------
   * 7. Migration -> Sitemap
   * ------------------------------------------------------------
   */

  const sitemapRows =
    manifestToSitemapRows(
      migrationResult.migratedManifest,
      registryRows
    );

  const sitemapXml =
    generateLocationSitemap(
      sitemapRows
    );

  pass(
    "Migrated manifest crosses Sitemap boundary",
    () => {
      const validatedRows =
        validateRows(
          sitemapRows
        );

      assert.equal(
        validatedRows.length,
        migrationResult.migratedManifest.length
      );

      assert.equal(
        validateGeneratedSitemap(
          sitemapXml
        ),
        true
      );
    }
  );

  /*
   * ------------------------------------------------------------
   * 8. Old route excluded from final sitemap
   * ------------------------------------------------------------
   */

  pass(
    "Old route is excluded from final sitemap",
    () => {
      assert.ok(
        sitemapXml.includes(
          "<loc>https://instantlegalservices.in/uttar-pradesh/bareilly/</loc>"
        )
      );

      assert.ok(
        !sitemapXml.includes(
          "<loc>https://instantlegalservices.in/district/bareilly/</loc>"
        )
      );
    }
  );

  /*
   * ------------------------------------------------------------
   * 9. Redirect serialization
   * ------------------------------------------------------------
   */

  pass(
    "Redirect serialization preserves exact contract",
    () => {
      const serialized =
        serializeRedirects(
          migrationResult.redirects
        );

      assert.ok(
        serialized.includes(
          UUID_DISTRICT
        )
      );

      assert.ok(
        serialized.includes(
          "/district/bareilly/"
        )
      );

      assert.ok(
        serialized.includes(
          "/uttar-pradesh/bareilly/"
        )
      );

      assert.ok(
        serialized.includes(
          REDIRECT_STATUS
        )
      );
    }
  );

  /*
   * ------------------------------------------------------------
   * 10. Rollback
   * ------------------------------------------------------------
   */

  pass(
    "Rollback restores exact pre-migration manifest",
    () => {
      const restored =
        rollbackMigration(
          migrationResult.rollback
        );

      assert.deepEqual(
        restored.manifest,
        originalManifest
      );

      assert.equal(
        restored.restored,
        true
      );

      assert.equal(
        restored.sha256,
        migrationResult.rollback.sha256
      );

      assert.equal(
        restored.status,
        "ROLLBACK-PASS"
      );
    }
  );

  /*
   * ------------------------------------------------------------
   * 11. Wrong namespace must fail
   * ------------------------------------------------------------
   */

  expectFail(
    "DISTRICT cannot migrate into TEHSIL namespace",
    () => {
      migrateLocations(
        originalManifest,
        [
          {
            sourceId:
              UUID_DISTRICT,

            locationType:
              "DISTRICT",

            newRoute:
              "/tehsil/bareilly/"
          }
        ]
      );
    }
  );

  /*
   * ------------------------------------------------------------
   * 12. Self-target must not create redirect
   * ------------------------------------------------------------
   */

  pass(
    "Unchanged route creates no redirect",
    () => {
      const result =
        migrateLocations(
          originalManifest,
          [
            {
              sourceId:
                UUID_DISTRICT,

              locationType:
                "DISTRICT",

              newRoute:
                "/district/bareilly/"
            }
          ]
        );

      assert.equal(
        result.redirects.length,
        0
      );
    }
  );

  /*
   * ------------------------------------------------------------
   * FINAL
   * ------------------------------------------------------------
   */

  console.log("");

  console.log(
    "=============================================="
  );

  console.log(
    "LOCATION MIGRATION INTEGRATION TEST RESULT"
  );

  console.log(
    "=============================================="
  );

  console.log(
    `PASS: ${passed}`
  );

  console.log(
    `FAIL: ${failed}`
  );

  console.log(
    `TOTAL: ${passed + failed}`
  );

  if (failed > 0) {
    console.error(
      "LOCATION_MIGRATION_INTEGRATION_TEST=FAIL"
    );

    process.exitCode = 1;
    return;
  }

  console.log(
    "LOCATION_MIGRATION_INTEGRATION_TEST=PASS"
  );
}

main();
