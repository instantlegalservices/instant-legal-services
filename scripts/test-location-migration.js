/**
 * Instant Legal Services
 * Location Migration Engine — Deterministic Test Suite
 *
 * Purpose:
 * - Test location-migration.js without touching production/live data.
 * - Verify route ownership, migration, redirects, rollback and hashes.
 * - Fail closed on collisions and invalid historical routes.
 *
 * IMPORTANT:
 * - No DB writes.
 * - No filesystem writes.
 * - No sitemap writes.
 * - No Git operations.
 */

"use strict";

const assert = require("assert");

const migration = require("./location-migration");

const {
  ACTIVE_STATUS,
  REDIRECT_STATUS,
  calculateContentHash,
  normalizeManifestEntry,
  buildManifestIndex,
  migrateLocations,
  rollbackMigration,
  serializeManifest,
  serializeRedirects,
  sha256Json,
} = migration;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(`      ${error.message}`);
  }
}

function expectThrow(name, fn) {
  test(name, () => {
    assert.throws(fn);
  });
}

/*
 * --------------------------------------------------------------------------
 * Fixtures
 * --------------------------------------------------------------------------
 */

const BASE_LOCATION = {
  sourceId: "location-bareilly",
  locationType: "DISTRICT",
  route: "/bareilly/",
  canonical: "/bareilly/",
  status: ACTIVE_STATUS,
  previousRoutes: [],
  generatorVersion: "location-migration-v1",
};

function makeEntry(overrides = {}) {
  return {
    ...BASE_LOCATION,
    ...overrides,
  };
}

/*
 * --------------------------------------------------------------------------
 * 1. Basic normalization
 * --------------------------------------------------------------------------
 */

test("normalize valid ACTIVE manifest entry", () => {
  const entry = normalizeManifestEntry(makeEntry());

  assert.strictEqual(entry.sourceId, "location-bareilly");
  assert.strictEqual(entry.locationType, "DISTRICT");
  assert.strictEqual(entry.route, "/bareilly/");
  assert.strictEqual(entry.canonical, "/bareilly/");
  assert.strictEqual(entry.status, ACTIVE_STATUS);
  assert.deepStrictEqual(entry.previousRoutes, []);
  assert.ok(/^[a-f0-9]{64}$/.test(entry.contentHash));
});

/*
 * --------------------------------------------------------------------------
 * 2. Canonical equals current route
 * --------------------------------------------------------------------------
 */

test("canonical equals current route", () => {
  const entry = normalizeManifestEntry(makeEntry());

  assert.strictEqual(
    entry.canonical,
    entry.route
  );
});

/*
 * --------------------------------------------------------------------------
 * 3. Deterministic content hash
 * --------------------------------------------------------------------------
 */

test("contentHash is deterministic", () => {
  const a = normalizeManifestEntry(makeEntry());
  const b = normalizeManifestEntry(makeEntry());

  assert.strictEqual(
    a.contentHash,
    b.contentHash
  );
});

test("changing route changes contentHash", () => {
  const a = normalizeManifestEntry(makeEntry());

  const b = normalizeManifestEntry(
    makeEntry({
      route: "/uttar-pradesh/bareilly/",
      canonical: "/uttar-pradesh/bareilly/",
    })
  );

  assert.notStrictEqual(
    a.contentHash,
    b.contentHash
  );
});

/*
 * --------------------------------------------------------------------------
 * 4. Supplied hash integrity
 * --------------------------------------------------------------------------
 */

expectThrow(
  "incorrect supplied contentHash is rejected",
  () => {
    normalizeManifestEntry(
      makeEntry({
        contentHash:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      })
    );
  }
);

test("correct supplied contentHash is accepted", () => {
  const calculated = calculateContentHash({
    sourceId: "location-bareilly",
    locationType: "DISTRICT",
    route: "/bareilly/",
    canonical: "/bareilly/",
    previousRoutes: [],
  });

  const entry = normalizeManifestEntry(
    makeEntry({
      contentHash: calculated,
    })
  );

  assert.strictEqual(
    entry.contentHash,
    calculated
  );
});

/*
 * --------------------------------------------------------------------------
 * 5. Duplicate sourceId
 * --------------------------------------------------------------------------
 */

expectThrow(
  "duplicate sourceId is rejected",
  () => {
    buildManifestIndex([
      makeEntry({
        route: "/bareilly/",
      }),
      makeEntry({
        route: "/other-route/",
        canonical: "/other-route/",
      }),
    ]);
  }
);

/*
 * --------------------------------------------------------------------------
 * 6. Duplicate current route
 * --------------------------------------------------------------------------
 */

expectThrow(
  "duplicate current route is rejected",
  () => {
    buildManifestIndex([
      makeEntry({
        sourceId: "location-one",
      }),
      makeEntry({
        sourceId: "location-two",
      }),
    ]);
  }
);

/*
 * --------------------------------------------------------------------------
 * 7. Invalid route
 * --------------------------------------------------------------------------
 */

expectThrow(
  "route without leading slash is rejected",
  () => {
    normalizeManifestEntry(
      makeEntry({
        route: "bareilly/",
        canonical: "bareilly/",
      })
    );
  }
);

expectThrow(
  "route without trailing slash is rejected",
  () => {
    normalizeManifestEntry(
      makeEntry({
        route: "/bareilly",
        canonical: "/bareilly",
      })
    );
  }
);

expectThrow(
  "dot-segment route is rejected",
  () => {
    normalizeManifestEntry(
      makeEntry({
        route: "/district/../bareilly/",
        canonical: "/district/../bareilly/",
      })
    );
  }
);

expectThrow(
  "backslash route is rejected",
  () => {
    normalizeManifestEntry(
      makeEntry({
        route: "/district\\bareilly/",
        canonical: "/district\\bareilly/",
      })
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 8. Historical route validation
 * --------------------------------------------------------------------------
 */

test("previousRoutes are preserved", () => {
  const entry = normalizeManifestEntry(
    makeEntry({
      route: "/uttar-pradesh/bareilly/",
      canonical: "/uttar-pradesh/bareilly/",
      previousRoutes: ["/bareilly/"],
      status: ACTIVE_STATUS,
    })
  );

  assert.deepStrictEqual(
    entry.previousRoutes,
    ["/bareilly/"]
  );
});

expectThrow(
  "current route cannot also be historical route",
  () => {
    buildManifestIndex([
      makeEntry({
        route: "/bareilly/",
        previousRoutes: ["/bareilly/"],
      }),
    ]);
  }
);

expectThrow(
  "historical route collision between locations is rejected",
  () => {
    buildManifestIndex([
      makeEntry({
        sourceId: "location-one",
        route: "/one/",
        canonical: "/one/",
        previousRoutes: ["/legacy/"],
      }),
      makeEntry({
        sourceId: "location-two",
        route: "/two/",
        canonical: "/two/",
        previousRoutes: ["/legacy/"],
      }),
    ]);
  }
);

/*
 * --------------------------------------------------------------------------
 * 9. Genuine migration
 * --------------------------------------------------------------------------
 */

test(
  "route migration produces new ACTIVE route and redirect",
  () => {
    const current = [
      makeEntry({
        route: "/bareilly/",
        canonical: "/bareilly/",
      }),
    ];

    const result = migrateLocations(
      current,
      [
        {
          sourceId: "location-bareilly",
          locationType: "DISTRICT",
          newRoute: "/uttar-pradesh/bareilly/",
        },
      ]
    );

    assert.strictEqual(
      result.migratedManifest.length,
      1
    );

    const migrated =
      result.migratedManifest[0];

    assert.strictEqual(
      migrated.route,
      "/uttar-pradesh/bareilly/"
    );

    assert.strictEqual(
      migrated.canonical,
      "/uttar-pradesh/bareilly/"
    );

    assert.strictEqual(
      migrated.status,
      ACTIVE_STATUS
    );

    assert.deepStrictEqual(
      migrated.previousRoutes,
      ["/bareilly/"]
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 10. Redirect target
 * --------------------------------------------------------------------------
 */

test(
  "migration creates exact old-route to new-route redirect",
  () => {
    const result = migrateLocations(
      [
        makeEntry({
          route: "/bareilly/",
          canonical: "/bareilly/",
        }),
      ],
      [
        {
          sourceId: "location-bareilly",
          locationType: "DISTRICT",
          newRoute: "/uttar-pradesh/bareilly/",
        },
      ]
    );

    assert.ok(
      Array.isArray(result.redirects)
    );

    assert.strictEqual(
      result.redirects.length,
      1
    );

    const redirect =
      result.redirects[0];

    assert.strictEqual(
      redirect.sourceId,
      "location-bareilly"
    );

    assert.strictEqual(
      redirect.locationType,
      "DISTRICT"
    );

    assert.strictEqual(
      redirect.from,
      "/bareilly/"
    );

    assert.strictEqual(
      redirect.to,
      "/uttar-pradesh/bareilly/"
    );

    assert.strictEqual(
      redirect.status,
      REDIRECT_STATUS
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 11. No redirect when route does not change
 * --------------------------------------------------------------------------
 */

test(
  "unchanged route does not create migration redirect",
  () => {
    const result = migrateLocations(
      [
        makeEntry({
          route: "/bareilly/",
          canonical: "/bareilly/",
        }),
      ],
      [
        {
          sourceId: "location-bareilly",
          locationType: "DISTRICT",
          newRoute: "/bareilly/",
        },
      ]
    );

    assert.strictEqual(
      result.redirects.length,
      0
    );

    assert.strictEqual(
      result.migratedManifest[0].status,
      ACTIVE_STATUS
    );

    assert.strictEqual(
      result.migratedManifest[0].route,
      "/bareilly/"
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 12. Collision with another current route
 * --------------------------------------------------------------------------
 */

expectThrow(
  "new route owned by another location is rejected",
  () => {
    migrateLocations(
      [
        makeEntry({
          sourceId: "location-one",
          route: "/one/",
          canonical: "/one/",
        }),
        makeEntry({
          sourceId: "location-two",
          route: "/two/",
          canonical: "/two/",
        }),
      ],
      [
        {
          sourceId: "location-one",
          locationType: "DISTRICT",
          newRoute: "/two/",
        },
      ]
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 13. Collision with historical route
 * --------------------------------------------------------------------------
 */

expectThrow(
  "new route cannot steal another location's historical route",
  () => {
    migrateLocations(
      [
        makeEntry({
          sourceId: "location-one",
          route: "/one/",
          canonical: "/one/",
          previousRoutes: ["/legacy/"],
        }),
        makeEntry({
          sourceId: "location-two",
          route: "/two/",
          canonical: "/two/",
        }),
      ],
      [
        {
          sourceId: "location-two",
          locationType: "DISTRICT",
          newRoute: "/legacy/",
        },
      ]
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 14. Self redirect
 * --------------------------------------------------------------------------
 */

test(
  "migration never creates self redirect",
  () => {
    const result = migrateLocations(
      [
        makeEntry({
          route: "/bareilly/",
          canonical: "/bareilly/",
        }),
      ],
      [
        {
          sourceId: "location-bareilly",
          locationType: "DISTRICT",
          newRoute: "/bareilly/",
        },
      ]
    );

    for (
      const redirect of result.redirects
    ) {
      assert.notStrictEqual(
        redirect.from,
        redirect.to
      );
    }
  }
);

/*
 * --------------------------------------------------------------------------
 * 15. Sitemap isolation
 * --------------------------------------------------------------------------
 */

test(
  "sitemap routes contain only current routes",
  () => {
    const result = migrateLocations(
      [
        makeEntry({
          route: "/bareilly/",
          canonical: "/bareilly/",
        }),
      ],
      [
        {
          sourceId: "location-bareilly",
          locationType: "DISTRICT",
          newRoute:
            "/uttar-pradesh/bareilly/",
        },
      ]
    );

    assert.ok(
      Array.isArray(
        result.sitemapRoutes
      )
    );

    assert.ok(
      result.sitemapRoutes.includes(
        "/uttar-pradesh/bareilly/"
      )
    );

    assert.ok(
      !result.sitemapRoutes.includes(
        "/bareilly/"
      )
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 16. Rollback
 * --------------------------------------------------------------------------
 */

test(
  "rollback restores original manifest",
  () => {
    const original = [
      normalizeManifestEntry(
        makeEntry({
          route: "/bareilly/",
          canonical: "/bareilly/",
        })
      ),
    ];

    const migrationResult =
      migrateLocations(
        original,
        [
          {
            sourceId:
              "location-bareilly",
            locationType: "DISTRICT",
            newRoute:
              "/uttar-pradesh/bareilly/",
          },
        ]
      );

    const restored =
      rollbackMigration(
        migrationResult.rollback
      );

    assert.deepStrictEqual(
      restored.manifest,
      original
    );

    assert.strictEqual(
      restored.restored,
      true
    );

    assert.strictEqual(
      restored.sha256,
      migrationResult.rollback.sha256
    );

    assert.strictEqual(
      restored.status,
      "ROLLBACK-PASS"
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 17. Manifest serialization
 * --------------------------------------------------------------------------
 */

test(
  "manifest serialization is deterministic",
  () => {
    const entries = [
      normalizeManifestEntry(
        makeEntry()
      ),
    ];

    const a =
      serializeManifest(entries);

    const b =
      serializeManifest(entries);

    assert.strictEqual(a, b);
  }
);

/*
 * --------------------------------------------------------------------------
 * 18. Redirect serialization
 * --------------------------------------------------------------------------
 */

test(
  "redirect serialization is deterministic",
  () => {
    const redirects = [
      {
        sourceId:
          "location-bareilly",
        locationType:
          "DISTRICT",
        from: "/bareilly/",
        to:
          "/uttar-pradesh/bareilly/",
        status:
          REDIRECT_STATUS,
      },
    ];

    const a =
      serializeRedirects(
        redirects
      );

    const b =
      serializeRedirects(
        redirects
      );

    assert.strictEqual(a, b);
  }
);

/*
 * --------------------------------------------------------------------------
 * 19. SHA-256 determinism
 * --------------------------------------------------------------------------
 */

test(
  "sha256Json is deterministic",
  () => {
    const value = {
      sourceId:
        "location-bareilly",
      route:
        "/bareilly/",
    };

    const hashA =
      sha256Json(value);

    const hashB =
      sha256Json(value);

    assert.strictEqual(
      hashA,
      hashB
    );

    assert.ok(
      /^[a-f0-9]{64}$/.test(
        hashA
      )
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 20. Migration summary
 * --------------------------------------------------------------------------
 */

test(
  "successful migration returns PASS summary",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry(),
        ],
        [
          {
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            newRoute:
              "/uttar-pradesh/bareilly/",
          },
        ]
      );

    assert.strictEqual(
      result.summary.status,
      "PASS"
    );

    assert.strictEqual(
      result.summary.migrated,
      1
    );

    assert.strictEqual(
      result.summary.redirectsRequired,
      1
    );

    assert.strictEqual(
      result.summary.currentRoutes,
      1
    );

    assert.strictEqual(
      result.summary.historicalRoutes,
      1
    );

    assert.strictEqual(
      result.summary.rollbackReady,
      true
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 21. Result contract
 * --------------------------------------------------------------------------
 */

test(
  "successful migration returns complete result contract",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry(),
        ],
        [
          {
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            newRoute:
              "/uttar-pradesh/bareilly/",
          },
        ]
      );

    assert.ok(
      Array.isArray(
        result.migratedManifest
      )
    );

    assert.ok(
      Array.isArray(
        result.redirects
      )
    );

    assert.ok(
      Array.isArray(
        result.sitemapRoutes
      )
    );

    assert.ok(
      result.rollback &&
      typeof result.rollback === "object"
    );

    assert.ok(
      result.summary &&
      typeof result.summary === "object"
    );

    assert.strictEqual(
      result.migratedManifest[0].route,
      "/uttar-pradesh/bareilly/"
    );

    assert.strictEqual(
      result.redirects[0].from,
      "/bareilly/"
    );

    assert.strictEqual(
      result.redirects[0].to,
      "/uttar-pradesh/bareilly/"
    );

    assert.strictEqual(
      result.sitemapRoutes.length,
      1
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 22. Migration preserves original input
 * --------------------------------------------------------------------------
 */

test(
  "migration does not mutate original manifest",
  () => {
    const original = [
      makeEntry({
        route: "/bareilly/",
        canonical: "/bareilly/",
      }),
    ];

    const before =
      JSON.stringify(original);

    migrateLocations(
      original,
      [
        {
          sourceId:
            "location-bareilly",
          locationType:
            "DISTRICT",
          newRoute:
            "/uttar-pradesh/bareilly/",
        },
      ]
    );

    assert.strictEqual(
      JSON.stringify(original),
      before
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 23. Migration target canonical
 * --------------------------------------------------------------------------
 */

expectThrow(
  "migration rejects canonical different from new route",
  () => {
    migrateLocations(
      [
        makeEntry(),
      ],
      [
        {
          sourceId:
            "location-bareilly",
          locationType:
            "DISTRICT",
          newRoute:
            "/uttar-pradesh/bareilly/",
          canonical:
            "/different-route/",
        },
      ]
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 24. Migration location type ownership
 * --------------------------------------------------------------------------
 */

expectThrow(
  "migration rejects silent locationType change",
  () => {
    migrateLocations(
      [
        makeEntry({
          locationType:
            "DISTRICT",
        }),
      ],
      [
        {
          sourceId:
            "location-bareilly",
          locationType:
            "TEHSIL",
          newRoute:
            "/tehsil/bareilly/",
        },
      ]
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 25. Duplicate migration sourceId
 * --------------------------------------------------------------------------
 */

expectThrow(
  "duplicate migration sourceId in one batch is rejected",
  () => {
    migrateLocations(
      [
        makeEntry(),
      ],
      [
        {
          sourceId:
            "location-bareilly",
          locationType:
            "DISTRICT",
          newRoute:
            "/uttar-pradesh/bareilly/",
        },
        {
          sourceId:
            "location-bareilly",
          locationType:
            "DISTRICT",
          newRoute:
            "/uttar-pradesh/bareilly-city/",
        },
      ]
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * Final report
 * --------------------------------------------------------------------------
 */

console.log("");

console.log(
  "=============================================="
);

console.log(
  "LOCATION MIGRATION TEST RESULT"
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

console.log(
  "=============================================="
);

if (failed > 0) {
  console.error(
    "LOCATION_MIGRATION_TEST=FAIL"
  );
  process.exitCode = 1;
} else {
  console.log(
    "LOCATION_MIGRATION_TEST=PASS"
  );
}
