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
  CURRENT_STATUS,
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


expectThrow(
  "route with leading whitespace is rejected",
  () => {
    normalizeManifestEntry(
      makeEntry({
        route: " /bareilly/",
        canonical: " /bareilly/",
      })
    );
  }
);

expectThrow(
  "route with trailing whitespace is rejected",
  () => {
    normalizeManifestEntry(
      makeEntry({
        route: "/bareilly/ ",
        canonical: "/bareilly/ ",
      })
    );
  }
);

expectThrow(
  "route with surrounding whitespace is rejected",
  () => {
    normalizeManifestEntry(
      makeEntry({
        route: " /bareilly/ ",
        canonical: " /bareilly/ ",
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
 * 17. Rollback snapshot integrity
 * --------------------------------------------------------------------------
 */

expectThrow(
  "rollback rejects tampered snapshot hash",
  () => {
    const migrationResult =
      migrateLocations(
        [
          makeEntry({
            route: "/bareilly/",
            canonical: "/bareilly/",
          }),
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

    const tamperedSnapshot =
      JSON.parse(
        JSON.stringify(
          migrationResult.rollback
        )
      );

    tamperedSnapshot.sha256 =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    rollbackMigration(
      tamperedSnapshot
    );
  }
);

expectThrow(
  "rollback rejects tampered manifest",
  () => {
    const migrationResult =
      migrateLocations(
        [
          makeEntry({
            route: "/bareilly/",
            canonical: "/bareilly/",
          }),
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

    const tamperedSnapshot =
      JSON.parse(
        JSON.stringify(
          migrationResult.rollback
        )
      );

    tamperedSnapshot.manifest[0].route =
      "/tampered/";

    rollbackMigration(
      tamperedSnapshot
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 18. Manifest serialization
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
 * 19. Redirect serialization
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
 * 20. SHA-256 determinism
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
 * 21. Migration summary
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
 * 22. Result contract
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
 * 23. Migration preserves original input
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
 * 24. Migration target canonical
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
 * 25. Migration location type ownership
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
 * 26. Duplicate migration sourceId
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
 * 27. Batch atomicity / fail-closed behavior
 * --------------------------------------------------------------------------
 */

test(
  "failed migration batch does not partially mutate original manifest",
  () => {
    const current = [
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
    ];

    const before = JSON.parse(
      JSON.stringify(current)
    );

    assert.throws(() => {
      migrateLocations(
        current,
        [
          {
            sourceId: "location-one",
            locationType: "DISTRICT",
            newRoute: "/one-new/",
          },
          {
            sourceId: "location-two",
            locationType: "DISTRICT",
            newRoute: "/two/",
          },
          {
            sourceId: "location-missing",
            locationType: "DISTRICT",
            newRoute: "/missing/",
          },
        ]
      );
    });

    assert.deepStrictEqual(
      current,
      before
    );

    assert.strictEqual(
      current[0].route,
      "/one/"
    );

    assert.strictEqual(
      current[1].route,
      "/two/"
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 28. Unknown sourceId
 * --------------------------------------------------------------------------
 */

expectThrow(
  "unknown sourceId is rejected",
  () => {
    migrateLocations(
      [
        makeEntry({
          sourceId: "location-bareilly",
          route: "/bareilly/",
          canonical: "/bareilly/",
        }),
      ],
      [
        {
          sourceId: "location-does-not-exist",
          locationType: "DISTRICT",
          newRoute: "/unknown-location/",
        },
      ]
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 29. Generator version handling
 * --------------------------------------------------------------------------
 */

test(
  "custom generatorVersion is preserved in migrated manifest",
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
      ],
      {
        generatorVersion: "location-migration-v2",
      }
    );

    assert.strictEqual(
      result.migratedManifest[0].generatorVersion,
      "location-migration-v2"
    );
  }
);

expectThrow(
  "invalid generatorVersion type is rejected",
  () => {
    migrateLocations(
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
      ],
      {
        generatorVersion: 123
      }
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 30. Migration options contract
 * --------------------------------------------------------------------------
 */

expectThrow(
  "migration rejects null options",
  () => {
    migrateLocations(
      [
        makeEntry({
          route: "/bareilly/",
          canonical: "/bareilly/",
        }),
      ],
      [],
      null
    );
  }
);

expectThrow(
  "migration rejects array options",
  () => {
    migrateLocations(
      [
        makeEntry({
          route: "/bareilly/",
          canonical: "/bareilly/",
        }),
      ],
      [],
      []
    );
  }
);

expectThrow(
  "migration rejects primitive options",
  () => {
    migrateLocations(
      [
        makeEntry({
          route: "/bareilly/",
          canonical: "/bareilly/",
        }),
      ],
      [],
      "invalid-options"
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 31. Strict generatorVersion option handling
 * --------------------------------------------------------------------------
 */

test(
  "missing generatorVersion uses default",
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
      ],
      {}
    );

    assert.strictEqual(
      result.migratedManifest[0].generatorVersion,
      "location-migration-v1"
    );
  }
);

test(
  "valid generatorVersion is preserved",
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
      ],
      {
        generatorVersion: "location-migration-v2",
      }
    );

    assert.strictEqual(
      result.migratedManifest[0].generatorVersion,
      "location-migration-v2"
    );
  }
);

expectThrow(
  "empty generatorVersion is rejected",
  () => {
    migrateLocations(
      [
        makeEntry(),
      ],
      [
        {
          sourceId: "location-bareilly",
          locationType: "DISTRICT",
          newRoute: "/uttar-pradesh/bareilly/",
        },
      ],
      {
        generatorVersion: "",
      }
    );
  }
);

expectThrow(
  "whitespace generatorVersion is rejected",
  () => {
    migrateLocations(
      [
        makeEntry(),
      ],
      [
        {
          sourceId: "location-bareilly",
          locationType: "DISTRICT",
          newRoute: "/uttar-pradesh/bareilly/",
        },
      ],
      {
        generatorVersion: "   ",
      }
    );
  }
);

expectThrow(
  "null generatorVersion is rejected",
  () => {
    migrateLocations(
      [
        makeEntry(),
      ],
      [
        {
          sourceId: "location-bareilly",
          locationType: "DISTRICT",
          newRoute: "/uttar-pradesh/bareilly/",
        },
      ],
      {
        generatorVersion: null,
      }
    );
  }
);

expectThrow(
  "boolean generatorVersion is rejected",
  () => {
    migrateLocations(
      [
        makeEntry(),
      ],
      [
        {
          sourceId: "location-bareilly",
          locationType: "DISTRICT",
          newRoute: "/uttar-pradesh/bareilly/",
        },
      ],
      {
        generatorVersion: false,
      }
    );
  }
);

expectThrow(
  "numeric generatorVersion is rejected",
  () => {
    migrateLocations(
      [
        makeEntry(),
      ],
      [
        {
          sourceId: "location-bareilly",
          locationType: "DISTRICT",
          newRoute: "/uttar-pradesh/bareilly/",
        },
      ],
      {
        generatorVersion: 0,
      }
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 32. Strict manifest status handling
 * --------------------------------------------------------------------------
 */

test(
  "missing status defaults to ACTIVE",
  () => {
    const entry = normalizeManifestEntry(
      makeEntry({
        status: undefined,
      })
    );

    assert.strictEqual(
      entry.status,
      ACTIVE_STATUS
    );
  }
);

test(
  "ACTIVE status is accepted",
  () => {
    const entry = normalizeManifestEntry(
      makeEntry({
        status: ACTIVE_STATUS,
      })
    );

    assert.strictEqual(
      entry.status,
      ACTIVE_STATUS
    );
  }
);

expectThrow(
  "CURRENT status is rejected as manifest status",
  () => {
    normalizeManifestEntry(
      makeEntry({
        status: "CURRENT",
      })
    );
  }
);

expectThrow(
  "REDIRECT-REQUIRED status is rejected as manifest status",
  () => {
    normalizeManifestEntry(
      makeEntry({
        status: REDIRECT_STATUS,
      })
    );
  }
);

expectThrow(
  "arbitrary manifest status is rejected",
  () => {
    normalizeManifestEntry(
      makeEntry({
        status: "BROKEN",
      })
    );
  }
);

expectThrow(
  "empty manifest status is rejected",
  () => {
    normalizeManifestEntry(
      makeEntry({
        status: "",
      })
    );
  }
);

expectThrow(
  "whitespace manifest status is rejected",
  () => {
    normalizeManifestEntry(
      makeEntry({
        status: "   ",
      })
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 33. Migrated entry status integrity
 * --------------------------------------------------------------------------
 */

test(
  "migrated entry status is always ACTIVE",
  () => {
    const result = migrateLocations(
      [
        makeEntry({
          sourceId: "location-bareilly",
          locationType: "DISTRICT",
          route: "/bareilly/",
          canonical: "/bareilly/",
          status: ACTIVE_STATUS,
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

    assert.strictEqual(
      result.migratedManifest.length,
      1
    );

    assert.strictEqual(
      result.migratedManifest[0].sourceId,
      "location-bareilly"
    );

    assert.strictEqual(
      result.migratedManifest[0].route,
      "/uttar-pradesh/bareilly/"
    );

    assert.strictEqual(
      result.migratedManifest[0].status,
      ACTIVE_STATUS
    );
  }
);

test(
  "migration keeps migrated entry status ACTIVE",
  () => {
    const result = migrateLocations(
      [
        makeEntry({
          sourceId: "location-bareilly",
          locationType: "DISTRICT",
          route: "/bareilly/",
          canonical: "/bareilly/",
          status: ACTIVE_STATUS,
        }),
      ],
      [
        {
          sourceId: "location-bareilly",
          locationType: "DISTRICT",
          newRoute: "/uttar-pradesh/bareilly/",
        },
      ],
      {
        generatorVersion: "location-migration-v2",
      }
    );

    assert.strictEqual(
      result.migratedManifest[0].status,
      ACTIVE_STATUS
    );

    assert.notStrictEqual(
      result.migratedManifest[0].status,
      REDIRECT_STATUS
    );

    assert.notStrictEqual(
      result.migratedManifest[0].status,
      CURRENT_STATUS
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 34. Redirect integrity after migration
 * --------------------------------------------------------------------------
 */

test(
  "migration redirect points directly from old route to final current route",
  () => {
    const result = migrateLocations(
      [
        makeEntry({
          sourceId: "location-bareilly",
          locationType: "DISTRICT",
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
      redirect.from,
      "/bareilly/"
    );

    assert.strictEqual(
      redirect.to,
      "/uttar-pradesh/bareilly/"
    );

    assert.strictEqual(
      result.migratedManifest[0].route,
      redirect.to
    );
  }
);

test(
  "migrated old route is excluded from sitemap",
  () => {
    const result = migrateLocations(
      [
        makeEntry({
          sourceId: "location-bareilly",
          locationType: "DISTRICT",
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

    assert.deepStrictEqual(
      result.sitemapRoutes,
      [
        "/uttar-pradesh/bareilly/",
      ]
    );

    assert.ok(
      !result.sitemapRoutes.includes(
        "/bareilly/"
      )
    );
  }
);

test(
  "old route is preserved only as historical route",
  () => {
    const result = migrateLocations(
      [
        makeEntry({
          sourceId: "location-bareilly",
          locationType: "DISTRICT",
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

    const entry =
      result.migratedManifest[0];

    assert.ok(
      entry.previousRoutes.includes(
        "/bareilly/"
      )
    );

    assert.strictEqual(
      entry.route,
      "/uttar-pradesh/bareilly/"
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 35. Redirect multi-hop protection
 * --------------------------------------------------------------------------
 */

test(
  "migration redirect targets final route directly",
  () => {
    const result = migrateLocations(
      [
        makeEntry({
          sourceId: "location-bareilly",
          locationType: "DISTRICT",
          route: "/bareilly/",
          canonical: "/bareilly/",
          previousRoutes: [
            "/old-bareilly/",
          ],
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

    assert.strictEqual(
      result.redirects.length,
      1
    );

    const redirect =
      result.redirects[0];

    assert.strictEqual(
      redirect.from,
      "/bareilly/"
    );

    assert.strictEqual(
      redirect.to,
      "/uttar-pradesh/bareilly/"
    );

    assert.notStrictEqual(
      redirect.to,
      "/old-bareilly/"
    );

    assert.strictEqual(
      result.migratedManifest[0].route,
      "/uttar-pradesh/bareilly/"
    );
  }
);

test(
  "historical routes do not become redirect intermediaries",
  () => {
    const result = migrateLocations(
      [
        makeEntry({
          sourceId: "location-bareilly",
          locationType: "DISTRICT",
          route: "/bareilly/",
          canonical: "/bareilly/",
          previousRoutes: [
            "/old-bareilly/",
          ],
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

    const redirect =
      result.redirects[0];

    assert.notStrictEqual(
      redirect.to,
      "/old-bareilly/"
    );

    assert.ok(
      result.migratedManifest[0]
        .previousRoutes
        .includes("/old-bareilly/")
    );

    assert.strictEqual(
      result.migratedManifest[0].route,
      redirect.to
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 36. Redirect chain / historical route collision protection
 * --------------------------------------------------------------------------
 */

test(
  "migration rejects target that is another location's historical route",
  () => {
    expectThrow(
      "migration rejects target that is another location's historical route",
      () =>
        migrateLocations(
          [
            makeEntry({
              sourceId: "location-bareilly",
              locationType: "DISTRICT",
              route: "/bareilly/",
              canonical: "/bareilly/",
              previousRoutes: [],
            }),
            makeEntry({
              sourceId: "location-lucknow",
              locationType: "DISTRICT",
              route: "/lucknow/",
              canonical: "/lucknow/",
              previousRoutes: [
                "/uttar-pradesh/bareilly/",
              ],
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
        )
    );
  }
);

test(
  "migration rejects target that is another location's current route",
  () => {
    expectThrow(
      "migration rejects target that is another location's current route",
      () =>
        migrateLocations(
          [
            makeEntry({
              sourceId: "location-bareilly",
              locationType: "DISTRICT",
              route: "/bareilly/",
              canonical: "/bareilly/",
              previousRoutes: [],
            }),
            makeEntry({
              sourceId: "location-lucknow",
              locationType: "DISTRICT",
              route:
                "/uttar-pradesh/bareilly/",
              canonical:
                "/uttar-pradesh/bareilly/",
              previousRoutes: [],
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
        )
    );
  }
);

test(
  "migration cannot create a redirect whose target is historical",
  () => {
    const currentManifest = [
      makeEntry({
        sourceId: "location-bareilly",
        locationType: "DISTRICT",
        route: "/bareilly/",
        canonical: "/bareilly/",
        previousRoutes: [
          "/old-bareilly/",
        ],
      }),
    ];

    const result = migrateLocations(
      currentManifest,
      [
        {
          sourceId: "location-bareilly",
          locationType: "DISTRICT",
          newRoute:
            "/uttar-pradesh/bareilly/",
        },
      ]
    );

    const redirect = result.redirects[0];

    assert.strictEqual(
      redirect.from,
      "/bareilly/"
    );

    assert.strictEqual(
      redirect.to,
      "/uttar-pradesh/bareilly/"
    );

    assert.ok(
      !result.sitemapRoutes.includes(
        "/old-bareilly/"
      )
    );

    assert.ok(
      !result.redirects.some(
        (item) =>
          item.to === "/old-bareilly/"
      )
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 37. Rollback snapshot tampering protection
 * --------------------------------------------------------------------------
 */

test(
  "rollback rejects tampered snapshot manifest",
  () => {
    const originalManifest = [
      makeEntry({
        sourceId: "location-bareilly",
        locationType: "DISTRICT",
        route: "/bareilly/",
        canonical: "/bareilly/",
        previousRoutes: [],
      }),
    ];

    const result = migrateLocations(
      originalManifest,
      [
        {
          sourceId: "location-bareilly",
          locationType: "DISTRICT",
          newRoute:
            "/uttar-pradesh/bareilly/",
        },
      ]
    );

    const tamperedSnapshot = {
      ...result.rollback,
      manifest: result.rollback.manifest.map(
        (entry) => ({
          ...entry,
          route: "/tampered/",
          canonical: "/tampered/",
        })
      ),
    };

    assert.throws(() =>
      rollbackMigration(
        tamperedSnapshot
      )
    );
  }
);

test(
  "rollback rejects tampered snapshot hash",
  () => {
    const originalManifest = [
      makeEntry({
        sourceId: "location-bareilly",
        locationType: "DISTRICT",
        route: "/bareilly/",
        canonical: "/bareilly/",
        previousRoutes: [],
      }),
    ];

    const result = migrateLocations(
      originalManifest,
      [
        {
          sourceId: "location-bareilly",
          locationType: "DISTRICT",
          newRoute:
            "/uttar-pradesh/bareilly/",
        },
      ]
    );

    const tamperedSnapshot = {
      ...result.rollback,
      sha256:
        "0000000000000000000000000000000000000000000000000000000000000000",
    };

    assert.throws(() =>
      rollbackMigration(
        tamperedSnapshot
      )
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 38. Rollback snapshot isolation
 * --------------------------------------------------------------------------
 */

test(
  "rollback snapshot is isolated from migrated manifest mutations",
  () => {
    const originalManifest = [
      makeEntry({
        sourceId: "location-bareilly",
        locationType: "DISTRICT",
        route: "/bareilly/",
        canonical: "/bareilly/",
        previousRoutes: [],
      }),
    ];

    const result = migrateLocations(
      originalManifest,
      [
        {
          sourceId: "location-bareilly",
          locationType: "DISTRICT",
          newRoute:
            "/uttar-pradesh/bareilly/",
        },
      ]
    );

    result.migratedManifest[0].route =
      "/tampered-current/";

    result.migratedManifest[0].canonical =
      "/tampered-current/";

    const restored =
      rollbackMigration(
        result.rollback
      );

    assert.strictEqual(
      restored.manifest[0].route,
      "/bareilly/"
    );

    assert.strictEqual(
      restored.manifest[0].canonical,
      "/bareilly/"
    );

    assert.strictEqual(
      restored.status,
      "ROLLBACK-PASS"
    );
  }
);

test(
  "rollback snapshot is isolated from original manifest mutations",
  () => {
    const originalManifest = [
      makeEntry({
        sourceId: "location-bareilly",
        locationType: "DISTRICT",
        route: "/bareilly/",
        canonical: "/bareilly/",
        previousRoutes: [],
      }),
    ];

    const result = migrateLocations(
      originalManifest,
      [
        {
          sourceId: "location-bareilly",
          locationType: "DISTRICT",
          newRoute:
            "/uttar-pradesh/bareilly/",
        },
      ]
    );

    originalManifest[0].route =
      "/tampered-original/";

    originalManifest[0].canonical =
      "/tampered-original/";

    const restored =
      rollbackMigration(
        result.rollback
      );

    assert.strictEqual(
      restored.manifest[0].route,
      "/bareilly/"
    );

    assert.strictEqual(
      restored.manifest[0].canonical,
      "/bareilly/"
    );

    assert.strictEqual(
      restored.status,
      "ROLLBACK-PASS"
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 39. Multi-location migration integrity
 * --------------------------------------------------------------------------
 */

test(
  "multiple locations migrate independently in one batch",
  () => {
    const currentManifest = [
      makeEntry({
        sourceId: "location-bareilly",
        locationType: "DISTRICT",
        route: "/bareilly/",
        canonical: "/bareilly/",
        previousRoutes: [],
      }),
      makeEntry({
        sourceId: "location-lucknow",
        locationType: "DISTRICT",
        route: "/lucknow/",
        canonical: "/lucknow/",
        previousRoutes: [],
      }),
    ];

    const result = migrateLocations(
      currentManifest,
      [
        {
          sourceId: "location-bareilly",
          locationType: "DISTRICT",
          newRoute:
            "/uttar-pradesh/bareilly/",
        },
        {
          sourceId: "location-lucknow",
          locationType: "DISTRICT",
          newRoute:
            "/uttar-pradesh/lucknow/",
        },
      ]
    );

    assert.strictEqual(
      result.migratedManifest.length,
      2
    );

    assert.strictEqual(
      result.redirects.length,
      2
    );

    assert.deepStrictEqual(
      result.sitemapRoutes,
      [
        "/uttar-pradesh/bareilly/",
        "/uttar-pradesh/lucknow/",
      ]
    );

    const bareilly =
      result.migratedManifest.find(
        (entry) =>
          entry.sourceId ===
          "location-bareilly"
      );

    const lucknow =
      result.migratedManifest.find(
        (entry) =>
          entry.sourceId ===
          "location-lucknow"
      );

    assert.ok(bareilly);
    assert.ok(lucknow);

    assert.strictEqual(
      bareilly.route,
      "/uttar-pradesh/bareilly/"
    );

    assert.strictEqual(
      lucknow.route,
      "/uttar-pradesh/lucknow/"
    );

    assert.ok(
      bareilly.previousRoutes.includes(
        "/bareilly/"
      )
    );

    assert.ok(
      lucknow.previousRoutes.includes(
        "/lucknow/"
      )
    );

    assert.strictEqual(
      bareilly.canonical,
      bareilly.route
    );

    assert.strictEqual(
      lucknow.canonical,
      lucknow.route
    );

    const bareillyRedirect =
      result.redirects.find(
        (redirect) =>
          redirect.sourceId ===
          "location-bareilly"
      );

    const lucknowRedirect =
      result.redirects.find(
        (redirect) =>
          redirect.sourceId ===
          "location-lucknow"
      );

    assert.strictEqual(
      bareillyRedirect.from,
      "/bareilly/"
    );

    assert.strictEqual(
      bareillyRedirect.to,
      "/uttar-pradesh/bareilly/"
    );

    assert.strictEqual(
      lucknowRedirect.from,
      "/lucknow/"
    );

    assert.strictEqual(
      lucknowRedirect.to,
      "/uttar-pradesh/lucknow/"
    );
  }
);

test(
  "multi-location rollback snapshot restores all original routes",
  () => {
    const currentManifest = [
      makeEntry({
        sourceId: "location-bareilly",
        locationType: "DISTRICT",
        route: "/bareilly/",
        canonical: "/bareilly/",
        previousRoutes: [],
      }),
      makeEntry({
        sourceId: "location-lucknow",
        locationType: "DISTRICT",
        route: "/lucknow/",
        canonical: "/lucknow/",
        previousRoutes: [],
      }),
    ];

    const result = migrateLocations(
      currentManifest,
      [
        {
          sourceId: "location-bareilly",
          locationType: "DISTRICT",
          newRoute:
            "/uttar-pradesh/bareilly/",
        },
        {
          sourceId: "location-lucknow",
          locationType: "DISTRICT",
          newRoute:
            "/uttar-pradesh/lucknow/",
        },
      ]
    );

    const restored =
      rollbackMigration(
        result.rollback
      );

    assert.deepStrictEqual(
      restored.manifest,
      [
        normalizeManifestEntry(
          currentManifest[0]
        ),
        normalizeManifestEntry(
          currentManifest[1]
        ),
      ].sort(
        (a, b) =>
          a.sourceId.localeCompare(
            b.sourceId
          )
      )
    );

    assert.strictEqual(
      restored.manifest.length,
      2
    );

    assert.strictEqual(
      restored.status,
      "ROLLBACK-PASS"
    );

    assert.strictEqual(
      restored.sha256,
      result.rollback.sha256
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 40. Deterministic migration output
 * --------------------------------------------------------------------------
 */

test(
  "migration output is deterministic regardless of input order",
  () => {
    const manifestA = [
      makeEntry({
        sourceId: "location-bareilly",
        locationType: "DISTRICT",
        route: "/bareilly/",
        canonical: "/bareilly/",
        previousRoutes: [],
      }),
      makeEntry({
        sourceId: "location-lucknow",
        locationType: "DISTRICT",
        route: "/lucknow/",
        canonical: "/lucknow/",
        previousRoutes: [],
      }),
    ];

    const manifestB = [
      makeEntry({
        sourceId: "location-lucknow",
        locationType: "DISTRICT",
        route: "/lucknow/",
        canonical: "/lucknow/",
        previousRoutes: [],
      }),
      makeEntry({
        sourceId: "location-bareilly",
        locationType: "DISTRICT",
        route: "/bareilly/",
        canonical: "/bareilly/",
        previousRoutes: [],
      }),
    ];

    const migrationsA = [
      {
        sourceId: "location-bareilly",
        locationType: "DISTRICT",
        newRoute:
          "/uttar-pradesh/bareilly/",
      },
      {
        sourceId: "location-lucknow",
        locationType: "DISTRICT",
        newRoute:
          "/uttar-pradesh/lucknow/",
      },
    ];

    const migrationsB = [
      {
        sourceId: "location-lucknow",
        locationType: "DISTRICT",
        newRoute:
          "/uttar-pradesh/lucknow/",
      },
      {
        sourceId: "location-bareilly",
        locationType: "DISTRICT",
        newRoute:
          "/uttar-pradesh/bareilly/",
      },
    ];

    const resultA =
      migrateLocations(
        manifestA,
        migrationsA
      );

    const resultB =
      migrateLocations(
        manifestB,
        migrationsB
      );

    assert.deepStrictEqual(
      resultA.migratedManifest,
      resultB.migratedManifest
    );

    assert.deepStrictEqual(
      resultA.redirects,
      resultB.redirects
    );

    assert.deepStrictEqual(
      resultA.sitemapRoutes,
      resultB.sitemapRoutes
    );

    assert.deepStrictEqual(
      resultA.rollback,
      resultB.rollback
    );

    assert.deepStrictEqual(
      resultA.summary,
      resultB.summary
    );
  }
);

test(
  "migration serialization remains deterministic after repeated execution",
  () => {
    const manifest = [
      makeEntry({
        sourceId: "location-bareilly",
        locationType: "DISTRICT",
        route: "/bareilly/",
        canonical: "/bareilly/",
        previousRoutes: [],
      }),
      makeEntry({
        sourceId: "location-lucknow",
        locationType: "DISTRICT",
        route: "/lucknow/",
        canonical: "/lucknow/",
        previousRoutes: [],
      }),
    ];

    const migrations = [
      {
        sourceId: "location-bareilly",
        locationType: "DISTRICT",
        newRoute:
          "/uttar-pradesh/bareilly/",
      },
      {
        sourceId: "location-lucknow",
        locationType: "DISTRICT",
        newRoute:
          "/uttar-pradesh/lucknow/",
      },
    ];

    const first =
      migrateLocations(
        manifest,
        migrations
      );

    const second =
      migrateLocations(
        manifest,
        migrations
      );

    assert.strictEqual(
      sha256Json(
        first.migratedManifest
      ),
      sha256Json(
        second.migratedManifest
      )
    );

    assert.strictEqual(
      sha256Json(
        first.redirects
      ),
      sha256Json(
        second.redirects
      )
    );

    assert.strictEqual(
      first.rollback.sha256,
      second.rollback.sha256
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 41. Route cycle / swap protection
 * --------------------------------------------------------------------------
 */

expectThrow(
  "migration rejects two-location route swap",
  () => {
    migrateLocations(
      [
        makeEntry({
          sourceId: "location-one",
          locationType: "DISTRICT",
          route: "/one/",
          canonical: "/one/",
          previousRoutes: [],
        }),
        makeEntry({
          sourceId: "location-two",
          locationType: "DISTRICT",
          route: "/two/",
          canonical: "/two/",
          previousRoutes: [],
        }),
      ],
      [
        {
          sourceId: "location-one",
          locationType: "DISTRICT",
          newRoute: "/two/",
        },
        {
          sourceId: "location-two",
          locationType: "DISTRICT",
          newRoute: "/one/",
        },
      ]
    );
  }
);

expectThrow(
  "migration rejects three-location route cycle",
  () => {
    migrateLocations(
      [
        makeEntry({
          sourceId: "location-one",
          locationType: "DISTRICT",
          route: "/one/",
          canonical: "/one/",
          previousRoutes: [],
        }),
        makeEntry({
          sourceId: "location-two",
          locationType: "DISTRICT",
          route: "/two/",
          canonical: "/two/",
          previousRoutes: [],
        }),
        makeEntry({
          sourceId: "location-three",
          locationType: "DISTRICT",
          route: "/three/",
          canonical: "/three/",
          previousRoutes: [],
        }),
      ],
      [
        {
          sourceId: "location-one",
          locationType: "DISTRICT",
          newRoute: "/two/",
        },
        {
          sourceId: "location-two",
          locationType: "DISTRICT",
          newRoute: "/three/",
        },
        {
          sourceId: "location-three",
          locationType: "DISTRICT",
          newRoute: "/one/",
        },
      ]
    );
  }
);

expectThrow(
  "migration rejects target reserved by another migration",
  () => {
    migrateLocations(
      [
        makeEntry({
          sourceId: "location-one",
          locationType: "DISTRICT",
          route: "/one/",
          canonical: "/one/",
          previousRoutes: [],
        }),
        makeEntry({
          sourceId: "location-two",
          locationType: "DISTRICT",
          route: "/two/",
          canonical: "/two/",
          previousRoutes: [],
        }),
      ],
      [
        {
          sourceId: "location-one",
          locationType: "DISTRICT",
          newRoute: "/shared/",
        },
        {
          sourceId: "location-two",
          locationType: "DISTRICT",
          newRoute: "/shared/",
        },
      ]
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 42. Redirect serialization integrity
 * --------------------------------------------------------------------------
 */

test(
  "redirect serialization normalizes status to REDIRECT",
  () => {
    const redirects = [
      {
        sourceId:
          "location-bareilly",
        locationType:
          "DISTRICT",
        from:
          "/bareilly/",
        to:
          "/uttar-pradesh/bareilly/",
        status:
          "INVALID-STATUS",
      },
    ];

    const serialized =
      serializeRedirects(
        redirects
      );

    const parsed =
      JSON.parse(
        serialized
      );

    assert.strictEqual(
      parsed.length,
      1
    );

    assert.strictEqual(
      parsed[0].status,
      REDIRECT_STATUS
    );

    assert.strictEqual(
      parsed[0].from,
      "/bareilly/"
    );

    assert.strictEqual(
      parsed[0].to,
      "/uttar-pradesh/bareilly/"
    );
  }
);

expectThrow(
  "redirect serialization rejects missing sourceId",
  () => {
    serializeRedirects([
      {
        locationType:
          "DISTRICT",
        from:
          "/bareilly/",
        to:
          "/uttar-pradesh/bareilly/",
        status:
          REDIRECT_STATUS,
      },
    ]);
  }
);

expectThrow(
  "redirect serialization rejects invalid locationType",
  () => {
    serializeRedirects([
      {
        sourceId:
          "location-bareilly",
        locationType:
          "INVALID-TYPE",
        from:
          "/bareilly/",
        to:
          "/uttar-pradesh/bareilly/",
        status:
          REDIRECT_STATUS,
      },
    ]);
  }
);

expectThrow(
  "redirect serialization rejects missing from route",
  () => {
    serializeRedirects([
      {
        sourceId:
          "location-bareilly",
        locationType:
          "DISTRICT",
        to:
          "/uttar-pradesh/bareilly/",
        status:
          REDIRECT_STATUS,
      },
    ]);
  }
);

expectThrow(
  "redirect serialization rejects missing to route",
  () => {
    serializeRedirects([
      {
        sourceId:
          "location-bareilly",
        locationType:
          "DISTRICT",
        from:
          "/bareilly/",
        status:
          REDIRECT_STATUS,
      },
    ]);
  }
);

expectThrow(
  "redirect serialization rejects duplicate from routes",
  () => {
    serializeRedirects([
      {
        sourceId:
          "location-bareilly",
        locationType:
          "DISTRICT",
        from:
          "/bareilly/",
        to:
          "/uttar-pradesh/bareilly/",
        status:
          REDIRECT_STATUS,
      },
      {
        sourceId:
          "location-bareilly-duplicate",
        locationType:
          "DISTRICT",
        from:
          "/bareilly/",
        to:
          "/another/",
        status:
          REDIRECT_STATUS,
      },
    ]);
  }
);

expectThrow(
  "redirect serialization rejects self redirect",
  () => {
    serializeRedirects([
      {
        sourceId:
          "location-bareilly",
        locationType:
          "DISTRICT",
        from:
          "/bareilly/",
        to:
          "/bareilly/",
        status:
          REDIRECT_STATUS,
      },
    ]);
  }
);
/*
 * --------------------------------------------------------------------------
 * 43. Manifest serialization integrity
 * --------------------------------------------------------------------------
 */

test(
  "manifest serialization returns valid normalized JSON",
  () => {
    const manifest = [
      makeEntry({
        sourceId:
          "location-bareilly",
        locationType:
          "DISTRICT",
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
        previousRoutes: [],
      }),
    ];

    const serialized =
      serializeManifest(
        manifest
      );

    const parsed =
      JSON.parse(
        serialized
      );

    assert.strictEqual(
      parsed.length,
      1
    );

    assert.strictEqual(
      parsed[0].sourceId,
      "location-bareilly"
    );

    assert.strictEqual(
      parsed[0].route,
      "/bareilly/"
    );

    assert.strictEqual(
      parsed[0].canonical,
      "/bareilly/"
    );

    assert.strictEqual(
      parsed[0].status,
      ACTIVE_STATUS
    );
  }
);

expectThrow(
  "manifest serialization rejects invalid supplied content hash",
  () => {
    serializeManifest([
      makeEntry({
        sourceId:
          "location-bareilly",
        locationType:
          "DISTRICT",
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
        previousRoutes: [],
        contentHash:
          "0".repeat(64),
      }),
    ]);
  }
);
expectThrow(
  "manifest serialization rejects missing sourceId",
  () => {
    serializeManifest([
      {
        locationType:
          "DISTRICT",
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
        status:
          ACTIVE_STATUS,
        previousRoutes: [],
      },
    ]);
  }
);

expectThrow(
  "manifest serialization rejects invalid status",
  () => {
    serializeManifest([
      makeEntry({
        status:
          "INVALID-STATUS",
      }),
    ]);
  }
);

expectThrow(
  "manifest serialization rejects duplicate sourceId",
  () => {
    serializeManifest([
      makeEntry({
        sourceId:
          "location-bareilly",
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
      }),
      makeEntry({
        sourceId:
          "location-bareilly",
        route:
          "/lucknow/",
        canonical:
          "/lucknow/",
      }),
    ]);
  }
);

expectThrow(
  "manifest serialization rejects duplicate current routes",
  () => {
    serializeManifest([
      makeEntry({
        sourceId:
          "location-bareilly",
        route:
          "/same/",
        canonical:
          "/same/",
      }),
      makeEntry({
        sourceId:
          "location-lucknow",
        route:
          "/same/",
        canonical:
          "/same/",
      }),
    ]);
  }
);

expectThrow(
  "manifest serialization rejects current route colliding with historical route",
  () => {
    serializeManifest([
      makeEntry({
        sourceId:
          "location-bareilly",
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
        previousRoutes: [
          "/old-bareilly/",
        ],
      }),
      makeEntry({
        sourceId:
          "location-lucknow",
        route:
          "/old-bareilly/",
        canonical:
          "/old-bareilly/",
        previousRoutes: [],
      }),
    ]);
  }
);

expectThrow(
  "manifest serialization rejects historical route collision",
  () => {
    serializeManifest([
      makeEntry({
        sourceId:
          "location-bareilly",
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
        previousRoutes: [
          "/shared-history/",
        ],
      }),
      makeEntry({
        sourceId:
          "location-lucknow",
        route:
          "/lucknow/",
        canonical:
          "/lucknow/",
        previousRoutes: [
          "/shared-history/",
        ],
      }),
    ]);
  }
);

test(
  "manifest serialization is deterministic regardless of input order",
  () => {
    const manifestA = [
      makeEntry({
        sourceId:
          "location-bareilly",
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
      }),
      makeEntry({
        sourceId:
          "location-lucknow",
        route:
          "/lucknow/",
        canonical:
          "/lucknow/",
      }),
    ];

    const manifestB = [
      makeEntry({
        sourceId:
          "location-lucknow",
        route:
          "/lucknow/",
        canonical:
          "/lucknow/",
      }),
      makeEntry({
        sourceId:
          "location-bareilly",
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
      }),
    ];

    assert.strictEqual(
      serializeManifest(
        manifestA
      ),
      serializeManifest(
        manifestB
      )
    );
  }
);

test(
  "manifest serialization ends with exactly one newline",
  () => {
    const serialized =
      serializeManifest([
        makeEntry({
          sourceId:
            "location-bareilly",
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
        }),
      ]);

    assert.ok(
      serialized.endsWith(
        "\n"
      )
    );

    assert.ok(
      !serialized.endsWith(
        "\n\n"
      )
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 44. Manifest serialization normalization contract
 * --------------------------------------------------------------------------
 */

test(
  "manifest serialization applies default status and generatorVersion",
  () => {
    const serialized =
      serializeManifest([
        {
          sourceId:
            "location-bareilly",
          locationType:
            "DISTRICT",
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        },
      ]);

    const parsed =
      JSON.parse(
        serialized
      );

    assert.strictEqual(
      parsed[0].status,
      ACTIVE_STATUS
    );

    assert.strictEqual(
      parsed[0].generatorVersion,
      "location-migration-v1"
    );
  }
);

test(
  "manifest serialization sorts and deduplicates previousRoutes",
  () => {
    const serialized =
      serializeManifest([
        makeEntry({
          previousRoutes: [
            "/z-old/",
            "/a-old/",
            "/z-old/",
          ],
        }),
      ]);

    const parsed =
      JSON.parse(
        serialized
      );

    assert.deepStrictEqual(
      parsed[0].previousRoutes,
      [
        "/a-old/",
        "/z-old/",
      ]
    );
  }
);

test(
  "manifest serialization normalizes uppercase valid content hash",
  () => {
    const entry =
      makeEntry({
        sourceId:
          "location-bareilly",
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
        previousRoutes: [],
      });

    const validHash =
      calculateContentHash(
        entry
      );

    const serialized =
      serializeManifest([
        {
          ...entry,
          contentHash:
            validHash.toUpperCase(),
        },
      ]);

    const parsed =
      JSON.parse(
        serialized
      );

    assert.strictEqual(
      parsed[0].contentHash,
      validHash
    );

    assert.strictEqual(
      parsed[0].contentHash,
      parsed[0].contentHash.toLowerCase()
    );
  }
);

test(
  "manifest serialization removes unsupported extra fields",
  () => {
    const serialized =
      serializeManifest([
        makeEntry({
          extraField:
            "must-not-be-serialized",
          internalFlag:
            true,
        }),
      ]);

    const parsed =
      JSON.parse(
        serialized
      );

    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(
        parsed[0],
        "extraField"
      ),
      false
    );

    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(
        parsed[0],
        "internalFlag"
      ),
      false
    );
  }
);

test(
  "manifest serialization produces empty JSON array for empty manifest",
  () => {
    const serialized =
      serializeManifest([]);

    assert.strictEqual(
      serialized,
      "[]\n"
    );

    const parsed =
      JSON.parse(
        serialized
      );

    assert.deepStrictEqual(
      parsed,
      []
    );
  }
);

expectThrow(
  "manifest serialization rejects non-array input",
  () => {
    serializeManifest(
      {}
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 45. End-to-end serialization round-trip integrity
 * --------------------------------------------------------------------------
 */

test(
  "migrated manifest survives serialize and parse round-trip",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            sourceId:
              "location-bareilly",
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
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

    const serialized =
      serializeManifest(
        result.migratedManifest
      );

    const parsed =
      JSON.parse(
        serialized
      );

    assert.deepStrictEqual(
      parsed,
      result.migratedManifest
    );
  }
);

test(
  "migrated manifest preserves content hash after round-trip",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            sourceId:
              "location-bareilly",
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
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

    const parsed =
      JSON.parse(
        serializeManifest(
          result.migratedManifest
        )
      );

    const entry =
      parsed[0];

    assert.strictEqual(
      entry.contentHash,
      calculateContentHash(
        entry
      )
    );
  }
);

test(
  "redirects survive serialize and parse round-trip",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            sourceId:
              "location-bareilly",
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
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

    const serialized =
      serializeRedirects(
        result.redirects
      );

    const parsed =
      JSON.parse(
        serialized
      );

    assert.deepStrictEqual(
      parsed,
      result.redirects
    );
  }
);

test(
  "round-trip preserves migrated route and historical route separation",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            sourceId:
              "location-bareilly",
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
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

    const manifest =
      JSON.parse(
        serializeManifest(
          result.migratedManifest
        )
      );

    const redirects =
      JSON.parse(
        serializeRedirects(
          result.redirects
        )
      );

    assert.strictEqual(
      manifest[0].route,
      "/uttar-pradesh/bareilly/"
    );

    assert.ok(
      manifest[0].previousRoutes.includes(
        "/bareilly/"
      )
    );

    assert.strictEqual(
      redirects[0].from,
      "/bareilly/"
    );

    assert.strictEqual(
      redirects[0].to,
      "/uttar-pradesh/bareilly/"
    );

    assert.notStrictEqual(
      manifest[0].route,
      redirects[0].from
    );
  }
);

test(
  "round-trip preserves sitemap isolation",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            sourceId:
              "location-bareilly",
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
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

    const manifest =
      JSON.parse(
        serializeManifest(
          result.migratedManifest
        )
      );

    const historicalRoutes =
      new Set(
        manifest.flatMap(
          entry =>
            entry.previousRoutes
        )
      );

    const sitemapRoutes =
      result.sitemapRoutes;

    for (
      const route
      of sitemapRoutes
    ) {
      assert.strictEqual(
        historicalRoutes.has(
          route
        ),
        false
      );
    }

    assert.deepStrictEqual(
      sitemapRoutes,
      [
        "/uttar-pradesh/bareilly/",
      ]
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 46. Empty / no-op migration integrity
 * --------------------------------------------------------------------------
 */

test(
  "empty migration batch preserves manifest exactly",
  () => {
    const manifest = [
      makeEntry({
        sourceId:
          "location-bareilly",
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
        previousRoutes: [],
      }),
    ];

    const before =
      JSON.stringify(
        manifest
      );

    const result =
      migrateLocations(
        manifest,
        []
      );

    assert.strictEqual(
      JSON.stringify(manifest),
      before
    );

    assert.deepStrictEqual(
      result.redirects,
      []
    );

    assert.deepStrictEqual(
      result.sitemapRoutes,
      [
        "/bareilly/",
      ]
    );

    assert.strictEqual(
      result.summary.migrated,
      0
    );

    assert.strictEqual(
      result.summary.redirectsRequired,
      0
    );

    assert.strictEqual(
      result.summary.currentRoutes,
      1
    );

    assert.strictEqual(
      result.summary.historicalRoutes,
      0
    );

    assert.strictEqual(
      result.summary.rollbackReady,
      true
    );

    assert.strictEqual(
      result.summary.status,
      "PASS"
    );
  }
);

test(
  "no-op migration creates no redirect",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            sourceId:
              "location-bareilly",
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
        ],
        [
          {
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            newRoute:
              "/bareilly/",
          },
        ]
      );

    assert.deepStrictEqual(
      result.redirects,
      []
    );

    assert.deepStrictEqual(
      result.sitemapRoutes,
      [
        "/bareilly/",
      ]
    );

    assert.strictEqual(
      result.summary.migrated,
      0
    );

    assert.strictEqual(
      result.summary.redirectsRequired,
      0
    );
  }
);

test(
  "no-op migration preserves previousRoutes",
  () => {
    const manifest = [
      makeEntry({
        sourceId:
          "location-bareilly",
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
        previousRoutes: [
          "/old-bareilly/",
          "/older-bareilly/",
        ],
      }),
    ];

    const result =
      migrateLocations(
        manifest,
        [
          {
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            newRoute:
              "/bareilly/",
          },
        ]
      );

    assert.deepStrictEqual(
      result.migratedManifest[0]
        .previousRoutes,
      [
        "/old-bareilly/",
        "/older-bareilly/",
      ]
    );

    assert.strictEqual(
      result.migratedManifest[0]
        .route,
      "/bareilly/"
    );
  }
);

test(
  "no-op migration preserves content hash",
  () => {
    const manifest = [
      makeEntry({
        sourceId:
          "location-bareilly",
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
        previousRoutes: [],
      }),
    ];

    const originalHash =
      calculateContentHash(
        manifest[0]
      );

    const result =
      migrateLocations(
        manifest,
        [
          {
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            newRoute:
              "/bareilly/",
          },
        ]
      );

    assert.strictEqual(
      result.migratedManifest[0]
        .contentHash,
      originalHash
    );

    assert.strictEqual(
      result.migratedManifest[0]
        .contentHash,
      calculateContentHash(
        result.migratedManifest[0]
      )
    );
  }
);

test(
  "empty migration rollback snapshot is valid",
  () => {
    const manifest = [
      makeEntry({
        sourceId:
          "location-bareilly",
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
        previousRoutes: [],
      }),
    ];

    const result =
      migrateLocations(
        manifest,
        []
      );

    const restored =
      rollbackMigration(
        result.rollback
      );

    assert.strictEqual(
      restored.status,
      "ROLLBACK-PASS"
    );

    assert.deepStrictEqual(
      restored.manifest,
      result.rollback.manifest
    );

    assert.strictEqual(
      restored.sha256,
      result.rollback.sha256
    );
  }
);

test(
  "empty migration output is deterministic",
  () => {
    const manifestA = [
      makeEntry({
        sourceId:
          "location-bareilly",
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
        previousRoutes: [],
      }),
    ];

    const manifestB = [
      makeEntry({
        sourceId:
          "location-bareilly",
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
        previousRoutes: [],
      }),
    ];

    const resultA =
      migrateLocations(
        manifestA,
        []
      );

    const resultB =
      migrateLocations(
        manifestB,
        []
      );

    assert.deepStrictEqual(
      resultA.migratedManifest,
      resultB.migratedManifest
    );

    assert.deepStrictEqual(
      resultA.redirects,
      resultB.redirects
    );

    assert.deepStrictEqual(
      resultA.sitemapRoutes,
      resultB.sitemapRoutes
    );

    assert.deepStrictEqual(
      resultA.rollback,
      resultB.rollback
    );

    assert.deepStrictEqual(
      resultA.summary,
      resultB.summary
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 47. Re-migration / historical-chain integrity
 * --------------------------------------------------------------------------
 */

test(
  "re-migration preserves complete historical route chain",
  () => {
    const currentManifest = [
      makeEntry({
        sourceId:
          "location-bareilly",
        locationType:
          "DISTRICT",
        route:
          "/uttar-pradesh/bareilly/",
        canonical:
          "/uttar-pradesh/bareilly/",
        previousRoutes: [
          "/bareilly/",
        ],
      }),
    ];

    const result =
      migrateLocations(
        currentManifest,
        [
          {
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            newRoute:
              "/up/bareilly/",
          },
        ]
      );

    const entry =
      result.migratedManifest[0];

    assert.strictEqual(
      entry.route,
      "/up/bareilly/"
    );

    assert.strictEqual(
      entry.canonical,
      "/up/bareilly/"
    );

    assert.deepStrictEqual(
      entry.previousRoutes,
      [
        "/bareilly/",
        "/uttar-pradesh/bareilly/",
      ]
    );
  }
);

test(
  "re-migration creates redirect only from immediate previous current route",
  () => {
    const currentManifest = [
      makeEntry({
        sourceId:
          "location-bareilly",
        locationType:
          "DISTRICT",
        route:
          "/uttar-pradesh/bareilly/",
        canonical:
          "/uttar-pradesh/bareilly/",
        previousRoutes: [
          "/bareilly/",
        ],
      }),
    ];

    const result =
      migrateLocations(
        currentManifest,
        [
          {
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            newRoute:
              "/up/bareilly/",
          },
        ]
      );

    assert.strictEqual(
      result.redirects.length,
      1
    );

    assert.strictEqual(
      result.redirects[0].from,
      "/uttar-pradesh/bareilly/"
    );

    assert.strictEqual(
      result.redirects[0].to,
      "/up/bareilly/"
    );

    assert.ok(
      !result.redirects.some(
        redirect =>
          redirect.from ===
          "/bareilly/"
      )
    );
  }
);

test(
  "re-migration sitemap contains only latest current route",
  () => {
    const currentManifest = [
      makeEntry({
        sourceId:
          "location-bareilly",
        locationType:
          "DISTRICT",
        route:
          "/uttar-pradesh/bareilly/",
        canonical:
          "/uttar-pradesh/bareilly/",
        previousRoutes: [
          "/bareilly/",
        ],
      }),
    ];

    const result =
      migrateLocations(
        currentManifest,
        [
          {
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            newRoute:
              "/up/bareilly/",
          },
        ]
      );

    assert.deepStrictEqual(
      result.sitemapRoutes,
      [
        "/up/bareilly/",
      ]
    );

    assert.ok(
      !result.sitemapRoutes.includes(
        "/bareilly/"
      )
    );

    assert.ok(
      !result.sitemapRoutes.includes(
        "/uttar-pradesh/bareilly/"
      )
    );
  }
);

test(
  "re-migration keeps historical routes out of redirect targets",
  () => {
    const currentManifest = [
      makeEntry({
        sourceId:
          "location-bareilly",
        locationType:
          "DISTRICT",
        route:
          "/uttar-pradesh/bareilly/",
        canonical:
          "/uttar-pradesh/bareilly/",
        previousRoutes: [
          "/bareilly/",
        ],
      }),
    ];

    const result =
      migrateLocations(
        currentManifest,
        [
          {
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            newRoute:
              "/up/bareilly/",
          },
        ]
      );

    for (
      const redirect
      of result.redirects
    ) {
      assert.notStrictEqual(
        redirect.to,
        "/bareilly/"
      );

      assert.notStrictEqual(
        redirect.to,
        "/uttar-pradesh/bareilly/"
      );
    }
  }
);

test(
  "re-migration content hash reflects complete historical chain",
  () => {
    const currentManifest = [
      makeEntry({
        sourceId:
          "location-bareilly",
        locationType:
          "DISTRICT",
        route:
          "/uttar-pradesh/bareilly/",
        canonical:
          "/uttar-pradesh/bareilly/",
        previousRoutes: [
          "/bareilly/",
        ],
      }),
    ];

    const result =
      migrateLocations(
        currentManifest,
        [
          {
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            newRoute:
              "/up/bareilly/",
          },
        ]
      );

    const entry =
      result.migratedManifest[0];

    assert.strictEqual(
      entry.contentHash,
      calculateContentHash(
        entry
      )
    );

    assert.notStrictEqual(
      entry.contentHash,
      calculateContentHash(
        currentManifest[0]
      )
    );
  }
);

test(
  "re-migration rollback restores the pre-migration current route and history",
  () => {
    const currentManifest = [
      makeEntry({
        sourceId:
          "location-bareilly",
        locationType:
          "DISTRICT",
        route:
          "/uttar-pradesh/bareilly/",
        canonical:
          "/uttar-pradesh/bareilly/",
        previousRoutes: [
          "/bareilly/",
        ],
      }),
    ];

    const result =
      migrateLocations(
        currentManifest,
        [
          {
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            newRoute:
              "/up/bareilly/",
          },
        ]
      );

    const restored =
      rollbackMigration(
        result.rollback
      );

    assert.strictEqual(
      restored.status,
      "ROLLBACK-PASS"
    );

    assert.strictEqual(
      restored.manifest[0].route,
      "/uttar-pradesh/bareilly/"
    );

    assert.deepStrictEqual(
      restored.manifest[0]
        .previousRoutes,
      [
        "/bareilly/",
      ]
    );

    assert.strictEqual(
      restored.manifest[0].canonical,
      "/uttar-pradesh/bareilly/"
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 48. Input immutability / normalization boundary
 * --------------------------------------------------------------------------
 */

test(
  "migration does not mutate migration items",
  () => {
    const migrationItems = [
      {
        sourceId:
          "location-bareilly",
        locationType:
          "DISTRICT",
        newRoute:
          "/uttar-pradesh/bareilly/",
      },
    ];

    const before =
      JSON.stringify(
        migrationItems
      );

    migrateLocations(
      [
        makeEntry({
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        }),
      ],
      migrationItems
    );

    assert.strictEqual(
      JSON.stringify(
        migrationItems
      ),
      before
    );
  }
);

test(
  "migration does not mutate migration item route",
  () => {
    const migrationItem = {
      sourceId:
        "location-bareilly",
      locationType:
        "DISTRICT",
      newRoute:
        "/uttar-pradesh/bareilly/",
    };

    migrateLocations(
      [
        makeEntry({
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        }),
      ],
      [
        migrationItem,
      ]
    );

    assert.strictEqual(
      migrationItem.newRoute,
      "/uttar-pradesh/bareilly/"
    );

    assert.strictEqual(
      migrationItem.canonical,
      undefined
    );
  }
);

test(
  "migration does not mutate original previousRoutes array",
  () => {
    const previousRoutes = [
      "/old-bareilly/",
      "/older-bareilly/",
    ];

    const manifest = [
      makeEntry({
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
        previousRoutes,
      }),
    ];

    const before =
      JSON.stringify(
        previousRoutes
      );

    migrateLocations(
      manifest,
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
      JSON.stringify(
        previousRoutes
      ),
      before
    );

    assert.deepStrictEqual(
      previousRoutes,
      [
        "/old-bareilly/",
        "/older-bareilly/",
      ]
    );
  }
);

test(
  "normalizing manifest does not mutate raw manifest entry",
  () => {
    const rawEntry = {
      sourceId:
        "location-bareilly",
      locationType:
        "DISTRICT",
      route:
        "/bareilly/",
      canonical:
        "/bareilly/",
      previousRoutes: [
        "/z-old/",
        "/a-old/",
        "/z-old/",
      ],
    };

    const before =
      JSON.stringify(
        rawEntry
      );

    normalizeManifestEntry(
      rawEntry
    );

    assert.strictEqual(
      JSON.stringify(
        rawEntry
      ),
      before
    );

    assert.deepStrictEqual(
      rawEntry.previousRoutes,
      [
        "/z-old/",
        "/a-old/",
        "/z-old/",
      ]
    );
  }
);

test(
  "migration output does not share previousRoutes array with input",
  () => {
    const previousRoutes = [
      "/old-bareilly/",
    ];

    const manifest = [
      makeEntry({
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
        previousRoutes,
      }),
    ];

    const result =
      migrateLocations(
        manifest,
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

    result.migratedManifest[0]
      .previousRoutes.push(
        "/tampered-output/"
      );

    assert.deepStrictEqual(
      previousRoutes,
      [
        "/old-bareilly/",
      ]
    );

    assert.deepStrictEqual(
      manifest[0].previousRoutes,
      [
        "/old-bareilly/",
      ]
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 49. Sequential migration integrity
 * --------------------------------------------------------------------------
 */

test(
  "sequential migration preserves complete route history",
  () => {
    const first = migrateLocations(
      [
        makeEntry({
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        }),
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

    const second = migrateLocations(
      first.migratedManifest,
      [
        {
          sourceId:
            "location-bareilly",
          locationType:
            "DISTRICT",
          newRoute:
            "/uttar-pradesh/bareilly-district/",
        },
      ]
    );

    const entry =
      second.migratedManifest.find(
        (item) =>
          item.sourceId ===
          "location-bareilly"
      );

    assert.ok(entry);

    assert.strictEqual(
      entry.route,
      "/uttar-pradesh/bareilly-district/"
    );

    assert.deepStrictEqual(
      entry.previousRoutes,
      [
        "/bareilly/",
        "/uttar-pradesh/bareilly/",
      ]
    );
  }
);

test(
  "sequential migration keeps every historical route non-current",
  () => {
    const first = migrateLocations(
      [
        makeEntry({
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        }),
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

    const second = migrateLocations(
      first.migratedManifest,
      [
        {
          sourceId:
            "location-bareilly",
          locationType:
            "DISTRICT",
          newRoute:
            "/uttar-pradesh/bareilly-district/",
        },
      ]
    );

    const currentRoutes =
      second.migratedManifest.map(
        (item) => item.route
      );

    const historicalRoutes =
      second.migratedManifest.flatMap(
        (item) =>
          item.previousRoutes
      );

    assert.ok(
      historicalRoutes.includes(
        "/bareilly/"
      )
    );

    assert.ok(
      historicalRoutes.includes(
        "/uttar-pradesh/bareilly/"
      )
    );

    assert.ok(
      !historicalRoutes.includes(
        "/uttar-pradesh/bareilly-district/"
      )
    );

    for (
      const historicalRoute
      of historicalRoutes
    ) {
      assert.ok(
        !currentRoutes.includes(
          historicalRoute
        )
      );
    }
  }
);

test(
  "sequential migration creates redirect only from immediate previous route",
  () => {
    const first = migrateLocations(
      [
        makeEntry({
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        }),
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

    const second = migrateLocations(
      first.migratedManifest,
      [
        {
          sourceId:
            "location-bareilly",
          locationType:
            "DISTRICT",
          newRoute:
            "/uttar-pradesh/bareilly-district/",
        },
      ]
    );

    assert.strictEqual(
      first.redirects.length,
      1
    );

    assert.strictEqual(
      second.redirects.length,
      1
    );

    assert.strictEqual(
      second.redirects[0].from,
      "/uttar-pradesh/bareilly/"
    );

    assert.strictEqual(
      second.redirects[0].to,
      "/uttar-pradesh/bareilly-district/"
    );

    assert.strictEqual(
      second.redirects[0].sourceId,
      "location-bareilly"
    );

    assert.ok(
      !second.redirects.some(
        (redirect) =>
          redirect.from ===
          "/bareilly/"
      )
    );
  }
);

test(
  "sequential migration exposes only latest route to sitemap",
  () => {
    const first = migrateLocations(
      [
        makeEntry({
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        }),
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

    const second = migrateLocations(
      first.migratedManifest,
      [
        {
          sourceId:
            "location-bareilly",
          locationType:
            "DISTRICT",
          newRoute:
            "/uttar-pradesh/bareilly-district/",
        },
      ]
    );

    assert.deepStrictEqual(
      second.sitemapRoutes,
      [
        "/uttar-pradesh/bareilly-district/",
      ]
    );

    assert.ok(
      !second.sitemapRoutes.includes(
        "/bareilly/"
      )
    );

    assert.ok(
      !second.sitemapRoutes.includes(
        "/uttar-pradesh/bareilly/"
      )
    );
  }
);

test(
  "content hash changes on every legitimate sequential migration",
  () => {
    const initial =
      normalizeManifestEntry(
        makeEntry({
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        })
      );

    const first =
      migrateLocations(
        [initial],
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

    const second =
      migrateLocations(
        first.migratedManifest,
        [
          {
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            newRoute:
              "/uttar-pradesh/bareilly-district/",
          },
        ]
      );

    const firstEntry =
      first.migratedManifest.find(
        (item) =>
          item.sourceId ===
          "location-bareilly"
      );

    const secondEntry =
      second.migratedManifest.find(
        (item) =>
          item.sourceId ===
          "location-bareilly"
      );

    assert.ok(firstEntry);
    assert.ok(secondEntry);

    assert.notStrictEqual(
      initial.contentHash,
      firstEntry.contentHash
    );

    assert.notStrictEqual(
      firstEntry.contentHash,
      secondEntry.contentHash
    );

    assert.strictEqual(
      secondEntry.contentHash,
      calculateContentHash(
        secondEntry
      )
    );
  }
);

test(
  "rollback snapshot remains valid after migrated output mutation",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
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

    const rollbackSnapshot =
      JSON.parse(
        JSON.stringify(
          result.rollback
        )
      );

    const rollbackHash =
      result.rollback.sha256;

    result.migratedManifest[0]
      .previousRoutes.push(
        "/tampered-history/"
      );

    result.migratedManifest[0]
      .route =
      "/tampered-current/";

    const rollback =
      rollbackMigration(
        rollbackSnapshot
      );

    assert.strictEqual(
      rollback.status,
      "ROLLBACK-PASS"
    );

    assert.strictEqual(
      rollback.sha256,
      rollbackHash
    );

    assert.strictEqual(
      rollback.manifest[0].route,
      "/bareilly/"
    );

    assert.deepStrictEqual(
      rollback.manifest[0].previousRoutes,
      []
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 50. Cross-entity collision & isolation
 * --------------------------------------------------------------------------
 */

test(
  "two locations migrate independently",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
          makeEntry({
            sourceId:
              "location-pilibhit",
            locationType:
              "DISTRICT",
            route:
              "/pilibhit/",
            canonical:
              "/pilibhit/",
            previousRoutes: [],
          }),
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
              "location-pilibhit",
            locationType:
              "DISTRICT",
            newRoute:
              "/uttar-pradesh/pilibhit/",
          },
        ]
      );

    const bareilly =
      result.migratedManifest.find(
        (item) =>
          item.sourceId ===
          "location-bareilly"
      );

    const pilibhit =
      result.migratedManifest.find(
        (item) =>
          item.sourceId ===
          "location-pilibhit"
      );

    assert.ok(bareilly);
    assert.ok(pilibhit);

    assert.strictEqual(
      bareilly.route,
      "/uttar-pradesh/bareilly/"
    );

    assert.strictEqual(
      pilibhit.route,
      "/uttar-pradesh/pilibhit/"
    );

    assert.deepStrictEqual(
      bareilly.previousRoutes,
      ["/bareilly/"]
    );

    assert.deepStrictEqual(
      pilibhit.previousRoutes,
      ["/pilibhit/"]
    );
  }
);

expectThrow(
  "one location cannot use another location current route",
  () => {
    migrateLocations(
      [
        makeEntry({
          sourceId:
            "location-bareilly",
          locationType:
            "DISTRICT",
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        }),
        makeEntry({
          sourceId:
            "location-pilibhit",
          locationType:
            "DISTRICT",
          route:
            "/pilibhit/",
          canonical:
            "/pilibhit/",
          previousRoutes: [],
        }),
      ],
      [
        {
          sourceId:
            "location-bareilly",
          locationType:
            "DISTRICT",
          newRoute:
            "/pilibhit/",
        },
      ]
    );
  }
);

expectThrow(
  "one location cannot use another location historical route",
  () => {
    migrateLocations(
      [
        makeEntry({
          sourceId:
            "location-bareilly",
          locationType:
            "DISTRICT",
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [
            "/old-bareilly/",
          ],
        }),
        makeEntry({
          sourceId:
            "location-pilibhit",
          locationType:
            "DISTRICT",
          route:
            "/pilibhit/",
          canonical:
            "/pilibhit/",
          previousRoutes: [
            "/old-pilibhit/",
          ],
        }),
      ],
      [
        {
          sourceId:
            "location-bareilly",
          locationType:
            "DISTRICT",
          newRoute:
            "/old-pilibhit/",
        },
      ]
    );
  }
);

test(
  "redirect ownership remains isolated between locations",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
          makeEntry({
            sourceId:
              "location-pilibhit",
            locationType:
              "DISTRICT",
            route:
              "/pilibhit/",
            canonical:
              "/pilibhit/",
            previousRoutes: [],
          }),
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
              "location-pilibhit",
            locationType:
              "DISTRICT",
            newRoute:
              "/uttar-pradesh/pilibhit/",
          },
        ]
      );

    assert.strictEqual(
      result.redirects.length,
      2
    );

    const bareillyRedirect =
      result.redirects.find(
        (redirect) =>
          redirect.sourceId ===
          "location-bareilly"
      );

    const pilibhitRedirect =
      result.redirects.find(
        (redirect) =>
          redirect.sourceId ===
          "location-pilibhit"
      );

    assert.ok(
      bareillyRedirect
    );

    assert.ok(
      pilibhitRedirect
    );

    assert.strictEqual(
      bareillyRedirect.from,
      "/bareilly/"
    );

    assert.strictEqual(
      bareillyRedirect.to,
      "/uttar-pradesh/bareilly/"
    );

    assert.strictEqual(
      pilibhitRedirect.from,
      "/pilibhit/"
    );

    assert.strictEqual(
      pilibhitRedirect.to,
      "/uttar-pradesh/pilibhit/"
    );
  }
);

test(
  "sitemap routes remain isolated between locations",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
          makeEntry({
            sourceId:
              "location-pilibhit",
            locationType:
              "DISTRICT",
            route:
              "/pilibhit/",
            canonical:
              "/pilibhit/",
            previousRoutes: [],
          }),
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
              "location-pilibhit",
            locationType:
              "DISTRICT",
            newRoute:
              "/uttar-pradesh/pilibhit/",
          },
        ]
      );

    assert.deepStrictEqual(
      result.sitemapRoutes,
      [
        "/uttar-pradesh/bareilly/",
        "/uttar-pradesh/pilibhit/",
      ]
    );

    assert.ok(
      !result.sitemapRoutes.includes(
        "/bareilly/"
      )
    );

    assert.ok(
      !result.sitemapRoutes.includes(
        "/pilibhit/"
      )
    );
  }
);

test(
  "rollback snapshot preserves both locations independently",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
          makeEntry({
            sourceId:
              "location-pilibhit",
            locationType:
              "DISTRICT",
            route:
              "/pilibhit/",
            canonical:
              "/pilibhit/",
            previousRoutes: [],
          }),
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
              "location-pilibhit",
            locationType:
              "DISTRICT",
            newRoute:
              "/uttar-pradesh/pilibhit/",
          },
        ]
      );

    const rollback =
      rollbackMigration(
        result.rollback
      );

    assert.strictEqual(
      rollback.status,
      "ROLLBACK-PASS"
    );

    assert.strictEqual(
      rollback.manifest.length,
      2
    );

    const bareilly =
      rollback.manifest.find(
        (item) =>
          item.sourceId ===
          "location-bareilly"
      );

    const pilibhit =
      rollback.manifest.find(
        (item) =>
          item.sourceId ===
          "location-pilibhit"
      );

    assert.ok(bareilly);
    assert.ok(pilibhit);

    assert.strictEqual(
      bareilly.route,
      "/bareilly/"
    );

    assert.strictEqual(
      pilibhit.route,
      "/pilibhit/"
    );

    assert.deepStrictEqual(
      bareilly.previousRoutes,
      []
    );

    assert.deepStrictEqual(
      pilibhit.previousRoutes,
      []
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 51. Route / canonical consistency
 * --------------------------------------------------------------------------
 */

test(
  "migrated entry canonical exactly matches current route",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
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

    const entry =
      result.migratedManifest.find(
        (item) =>
          item.sourceId ===
          "location-bareilly"
      );

    assert.ok(entry);

    assert.strictEqual(
      entry.route,
      "/uttar-pradesh/bareilly/"
    );

    assert.strictEqual(
      entry.canonical,
      entry.route
    );
  }
);

test(
  "sequential migration keeps canonical equal to latest route",
  () => {
    const first =
      migrateLocations(
        [
          makeEntry({
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
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

    const second =
      migrateLocations(
        first.migratedManifest,
        [
          {
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            newRoute:
              "/uttar-pradesh/bareilly-district/",
          },
        ]
      );

    const entry =
      second.migratedManifest.find(
        (item) =>
          item.sourceId ===
          "location-bareilly"
      );

    assert.ok(entry);

    assert.strictEqual(
      entry.route,
      "/uttar-pradesh/bareilly-district/"
    );

    assert.strictEqual(
      entry.canonical,
      "/uttar-pradesh/bareilly-district/"
    );

    assert.strictEqual(
      entry.canonical,
      entry.route
    );
  }
);

test(
  "historical routes never become canonical",
  () => {
    const first =
      migrateLocations(
        [
          makeEntry({
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
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

    const second =
      migrateLocations(
        first.migratedManifest,
        [
          {
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            newRoute:
              "/uttar-pradesh/bareilly-district/",
          },
        ]
      );

    const entry =
      second.migratedManifest.find(
        (item) =>
          item.sourceId ===
          "location-bareilly"
      );

    assert.ok(entry);

    assert.strictEqual(
      entry.canonical,
      entry.route
    );

    for (
      const historicalRoute
      of entry.previousRoutes
    ) {
      assert.notStrictEqual(
        historicalRoute,
        entry.canonical
      );
    }
  }
);

test(
  "multiple migrated locations each retain independent canonical routes",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
          makeEntry({
            sourceId:
              "location-pilibhit",
            locationType:
              "DISTRICT",
            route:
              "/pilibhit/",
            canonical:
              "/pilibhit/",
            previousRoutes: [],
          }),
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
              "location-pilibhit",
            locationType:
              "DISTRICT",
            newRoute:
              "/uttar-pradesh/pilibhit/",
          },
        ]
      );

    for (
      const entry
      of result.migratedManifest
    ) {
      assert.strictEqual(
        entry.canonical,
        entry.route
      );

      assert.ok(
        !entry.previousRoutes.includes(
          entry.canonical
        )
      );
    }
  }
);

expectThrow(
  "migration rejects mismatched supplied canonical",
  () => {
    migrateLocations(
      [
        makeEntry({
          sourceId:
            "location-bareilly",
          locationType:
            "DISTRICT",
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        }),
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
            "/wrong-canonical/",
        },
      ]
    );
  }
);

test(
  "rollback restores route and canonical consistency",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
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

    const rollback =
      rollbackMigration(
        result.rollback
      );

    assert.strictEqual(
      rollback.status,
      "ROLLBACK-PASS"
    );

    const entry =
      rollback.manifest.find(
        (item) =>
          item.sourceId ===
          "location-bareilly"
      );

    assert.ok(entry);

    assert.strictEqual(
      entry.route,
      "/bareilly/"
    );

    assert.strictEqual(
      entry.canonical,
      "/bareilly/"
    );

    assert.strictEqual(
      entry.canonical,
      entry.route
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 52. Content-hash integrity
 * --------------------------------------------------------------------------
 */

test(
  "same normalized entry produces the same content hash",
  () => {
    const entryA =
      normalizeManifestEntry(
        makeEntry({
          sourceId:
            "location-bareilly",
          locationType:
            "DISTRICT",
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        })
      );

    const entryB =
      normalizeManifestEntry(
        makeEntry({
          sourceId:
            "location-bareilly",
          locationType:
            "DISTRICT",
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        })
      );

    assert.strictEqual(
      entryA.contentHash,
      entryB.contentHash
    );

    assert.strictEqual(
      entryA.contentHash,
      calculateContentHash(entryA)
    );
  }
);

test(
  "route change changes content hash",
  () => {
    const original =
      normalizeManifestEntry(
        makeEntry({
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        })
      );

    const changed =
      normalizeManifestEntry(
        makeEntry({
          route:
            "/uttar-pradesh/bareilly/",
          canonical:
            "/uttar-pradesh/bareilly/",
          previousRoutes: [],
        })
      );

    assert.notStrictEqual(
      original.contentHash,
      changed.contentHash
    );
  }
);

test(
  "previousRoutes change changes content hash",
  () => {
    const original =
      normalizeManifestEntry(
        makeEntry({
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        })
      );

    const changed =
      normalizeManifestEntry(
        makeEntry({
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [
            "/old-bareilly/",
          ],
        })
      );

    assert.notStrictEqual(
      original.contentHash,
      changed.contentHash
    );
  }
);

test(
  "sourceId change changes content hash",
  () => {
    const original =
      normalizeManifestEntry(
        makeEntry({
          sourceId:
            "location-bareilly",
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        })
      );

    const changed =
      normalizeManifestEntry(
        makeEntry({
          sourceId:
            "location-pilibhit",
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        })
      );

    assert.notStrictEqual(
      original.contentHash,
      changed.contentHash
    );
  }
);

test(
  "locationType change changes content hash",
  () => {
    const original =
      normalizeManifestEntry(
        makeEntry({
          sourceId:
            "location-bareilly",
          locationType:
            "DISTRICT",
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        })
      );

    const changed =
      normalizeManifestEntry(
        makeEntry({
          sourceId:
            "location-bareilly",
          locationType:
            "STATE",
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        })
      );

    assert.notStrictEqual(
      original.contentHash,
      changed.contentHash
    );
  }
);

test(
  "default and explicit ACTIVE status do not alter content hash payload",
  () => {
    const defaultStatus =
      normalizeManifestEntry(
        makeEntry({
          sourceId:
            "location-bareilly",
          locationType:
            "DISTRICT",
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
          generatorVersion:
            "location-migration-v1",
        })
      );

    const explicitActiveStatus =
      normalizeManifestEntry(
        makeEntry({
          sourceId:
            "location-bareilly",
          locationType:
            "DISTRICT",
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
          status:
            ACTIVE_STATUS,
          generatorVersion:
            "location-migration-test-v2",
        })
      );

    assert.strictEqual(
      defaultStatus.status,
      ACTIVE_STATUS
    );

    assert.strictEqual(
      explicitActiveStatus.status,
      ACTIVE_STATUS
    );

    assert.strictEqual(
      defaultStatus.contentHash,
      explicitActiveStatus.contentHash
    );

    assert.strictEqual(
      defaultStatus.contentHash,
      calculateContentHash(
        defaultStatus
      )
    );

    assert.strictEqual(
      explicitActiveStatus.contentHash,
      calculateContentHash(
        explicitActiveStatus
      )
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 53. Failure atomicity / no partial mutation
 * --------------------------------------------------------------------------
 */

test(
  "failed migration does not partially mutate original manifest",
  () => {
    const manifest = [
      makeEntry({
        sourceId:
          "location-bareilly",
        locationType:
          "DISTRICT",
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
        previousRoutes: [],
      }),
      makeEntry({
        sourceId:
          "location-pilibhit",
        locationType:
          "DISTRICT",
        route:
          "/pilibhit/",
        canonical:
          "/pilibhit/",
        previousRoutes: [],
      }),
    ];

    const before =
      JSON.stringify(manifest);

    assert.throws(
      () => {
        migrateLocations(
          manifest,
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
                "location-pilibhit",
              locationType:
                "DISTRICT",
              newRoute:
                "/uttar-pradesh/bareilly/",
            },
          ]
        );
      }
    );

    assert.strictEqual(
      JSON.stringify(manifest),
      before
    );

    assert.strictEqual(
      manifest[0].route,
      "/bareilly/"
    );

    assert.strictEqual(
      manifest[1].route,
      "/pilibhit/"
    );
  }
);

test(
  "failed migration does not mutate original previousRoutes",
  () => {
    const previousRoutes = [
      "/old-bareilly/",
    ];

    const manifest = [
      makeEntry({
        sourceId:
          "location-bareilly",
        locationType:
          "DISTRICT",
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
        previousRoutes,
      }),
      makeEntry({
        sourceId:
          "location-pilibhit",
        locationType:
          "DISTRICT",
        route:
          "/pilibhit/",
        canonical:
          "/pilibhit/",
        previousRoutes: [],
      }),
    ];

    const beforeManifest =
      JSON.stringify(manifest);

    const beforeHistory =
      JSON.stringify(
        previousRoutes
      );

    assert.throws(
      () => {
        migrateLocations(
          manifest,
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
                "location-pilibhit",
              locationType:
                "DISTRICT",
              newRoute:
                "/old-bareilly/",
            },
          ]
        );
      }
    );

    assert.strictEqual(
      JSON.stringify(manifest),
      beforeManifest
    );

    assert.strictEqual(
      JSON.stringify(previousRoutes),
      beforeHistory
    );
  }
);

test(
  "failed migration does not mutate migration items",
  () => {
    const migrationItems = [
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
          "location-pilibhit",
        locationType:
          "DISTRICT",
        newRoute:
          "/uttar-pradesh/bareilly/",
      },
    ];

    const before =
      JSON.stringify(
        migrationItems
      );

    assert.throws(
      () => {
        migrateLocations(
          [
            makeEntry({
              sourceId:
                "location-bareilly",
              locationType:
                "DISTRICT",
              route:
                "/bareilly/",
              canonical:
                "/bareilly/",
              previousRoutes: [],
            }),
            makeEntry({
              sourceId:
                "location-pilibhit",
              locationType:
                "DISTRICT",
              route:
                "/pilibhit/",
              canonical:
                "/pilibhit/",
              previousRoutes: [],
            }),
          ],
          migrationItems
        );
      }
    );

    assert.strictEqual(
      JSON.stringify(
        migrationItems
      ),
      before
    );
  }
);

test(
  "failed migration caused by unknown sourceId leaves manifest unchanged",
  () => {
    const manifest = [
      makeEntry({
        sourceId:
          "location-bareilly",
        locationType:
          "DISTRICT",
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
        previousRoutes: [],
      }),
    ];

    const before =
      JSON.stringify(manifest);

    assert.throws(
      () => {
        migrateLocations(
          manifest,
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
                "location-unknown",
              locationType:
                "DISTRICT",
              newRoute:
                "/unknown/",
            },
          ]
        );
      }
    );

    assert.strictEqual(
      JSON.stringify(manifest),
      before
    );
  }
);

test(
  "failed migration caused by locationType mismatch leaves manifest unchanged",
  () => {
    const manifest = [
      makeEntry({
        sourceId:
          "location-bareilly",
        locationType:
          "DISTRICT",
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
        previousRoutes: [],
      }),
    ];

    const before =
      JSON.stringify(manifest);

    assert.throws(
      () => {
        migrateLocations(
          manifest,
          [
            {
              sourceId:
                "location-bareilly",
              locationType:
                "STATE",
              newRoute:
                "/uttar-pradesh/bareilly/",
            },
          ]
        );
      }
    );

    assert.strictEqual(
      JSON.stringify(manifest),
      before
    );

    assert.strictEqual(
      manifest[0].route,
      "/bareilly/"
    );

    assert.strictEqual(
      manifest[0].canonical,
      "/bareilly/"
    );

    assert.deepStrictEqual(
      manifest[0].previousRoutes,
      []
    );
  }
);

test(
  "failed migration does not leave partially created redirects",
  () => {
    const manifest = [
      makeEntry({
        sourceId:
          "location-bareilly",
        locationType:
          "DISTRICT",
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
        previousRoutes: [],
      }),
      makeEntry({
        sourceId:
          "location-pilibhit",
        locationType:
          "DISTRICT",
        route:
          "/pilibhit/",
        canonical:
          "/pilibhit/",
        previousRoutes: [],
      }),
    ];

    let result;

    assert.throws(
      () => {
        result =
          migrateLocations(
            manifest,
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
                  "location-pilibhit",
                locationType:
                  "DISTRICT",
                newRoute:
                  "/uttar-pradesh/bareilly/",
              },
            ]
          );
      }
    );

    assert.strictEqual(
      result,
      undefined
    );

    assert.strictEqual(
      manifest[0].route,
      "/bareilly/"
    );

    assert.strictEqual(
      manifest[1].route,
      "/pilibhit/"
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 54. Deterministic ordering & duplicate protection
 * --------------------------------------------------------------------------
 */

test(
  "migrated manifest is sorted deterministically by sourceId",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            sourceId:
              "location-pilibhit",
            locationType:
              "DISTRICT",
            route:
              "/pilibhit/",
            canonical:
              "/pilibhit/",
            previousRoutes: [],
          }),
          makeEntry({
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
        ],
        [
          {
            sourceId:
              "location-pilibhit",
            locationType:
              "DISTRICT",
            newRoute:
              "/uttar-pradesh/pilibhit/",
          },
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

    assert.deepStrictEqual(
      result.migratedManifest.map(
        (entry) =>
          entry.sourceId
      ),
      [
        "location-bareilly",
        "location-pilibhit",
      ]
    );
  }
);

test(
  "migration output is deterministic regardless of migration input order",
  () => {
    const manifest = [
      makeEntry({
        sourceId:
          "location-bareilly",
        locationType:
          "DISTRICT",
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
        previousRoutes: [],
      }),
      makeEntry({
        sourceId:
          "location-pilibhit",
        locationType:
          "DISTRICT",
        route:
          "/pilibhit/",
        canonical:
          "/pilibhit/",
        previousRoutes: [],
      }),
    ];

    const resultA =
      migrateLocations(
        manifest,
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
              "location-pilibhit",
            locationType:
              "DISTRICT",
            newRoute:
              "/uttar-pradesh/pilibhit/",
          },
        ]
      );

    const resultB =
      migrateLocations(
        manifest,
        [
          {
            sourceId:
              "location-pilibhit",
            locationType:
              "DISTRICT",
            newRoute:
              "/uttar-pradesh/pilibhit/",
          },
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

    assert.deepStrictEqual(
      resultA.migratedManifest,
      resultB.migratedManifest
    );

    assert.deepStrictEqual(
      resultA.redirects,
      resultB.redirects
    );

    assert.deepStrictEqual(
      resultA.sitemapRoutes,
      resultB.sitemapRoutes
    );

    assert.deepStrictEqual(
      resultA.rollback,
      resultB.rollback
    );
  }
);

test(
  "redirect records are sorted deterministically by source route",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            sourceId:
              "location-pilibhit",
            locationType:
              "DISTRICT",
            route:
              "/pilibhit/",
            canonical:
              "/pilibhit/",
            previousRoutes: [],
          }),
          makeEntry({
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
        ],
        [
          {
            sourceId:
              "location-pilibhit",
            locationType:
              "DISTRICT",
            newRoute:
              "/uttar-pradesh/pilibhit/",
          },
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

    assert.deepStrictEqual(
      result.redirects.map(
        (redirect) =>
          redirect.from
      ),
      [
        "/bareilly/",
        "/pilibhit/",
      ]
    );
  }
);

expectThrow(
  "duplicate sourceId in manifest is rejected",
  () => {
    buildManifestIndex(
      [
        makeEntry({
          sourceId:
            "location-bareilly",
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        }),
        makeEntry({
          sourceId:
            "location-bareilly",
          route:
            "/bareilly-2/",
          canonical:
            "/bareilly-2/",
          previousRoutes: [],
        }),
      ]
    );
  }
);

expectThrow(
  "duplicate migration target route is rejected",
  () => {
    migrateLocations(
      [
        makeEntry({
          sourceId:
            "location-bareilly",
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        }),
        makeEntry({
          sourceId:
            "location-pilibhit",
          route:
            "/pilibhit/",
          canonical:
            "/pilibhit/",
          previousRoutes: [],
        }),
      ],
      [
        {
          sourceId:
            "location-bareilly",
          locationType:
            "DISTRICT",
          newRoute:
            "/uttar-pradesh/same-route/",
        },
        {
          sourceId:
            "location-pilibhit",
          locationType:
            "DISTRICT",
          newRoute:
            "/uttar-pradesh/same-route/",
        },
      ]
    );
  }
);

expectThrow(
  "duplicate historical route ownership is rejected",
  () => {
    buildManifestIndex(
      [
        makeEntry({
          sourceId:
            "location-bareilly",
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [
            "/old-location/",
          ],
        }),
        makeEntry({
          sourceId:
            "location-pilibhit",
          route:
            "/pilibhit/",
          canonical:
            "/pilibhit/",
          previousRoutes: [
            "/old-location/",
          ],
        }),
      ]
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 55. Malformed input / fail-closed boundary
 * --------------------------------------------------------------------------
 */

expectThrow(
  "null current manifest is rejected",
  () => {
    migrateLocations(
      null,
      []
    );
  }
);

expectThrow(
  "null migration items are rejected",
  () => {
    migrateLocations(
      [
        makeEntry({
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        }),
      ],
      null
    );
  }
);

expectThrow(
  "non-object migration item is rejected",
  () => {
    migrateLocations(
      [
        makeEntry({
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        }),
      ],
      [
        null,
      ]
    );
  }
);

expectThrow(
  "manifest entry with malformed previousRoutes is rejected",
  () => {
    normalizeManifestEntry(
      makeEntry({
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
        previousRoutes:
          "not-an-array",
      })
    );
  }
);

expectThrow(
  "migration item with malformed newRoute is rejected",
  () => {
    migrateLocations(
      [
        makeEntry({
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        }),
      ],
      [
        {
          sourceId:
            "location-bareilly",
          locationType:
            "DISTRICT",
          newRoute:
            "not-a-route",
        },
      ]
    );
  }
);

expectThrow(
  "null migration options are rejected",
  () => {
    migrateLocations(
      [
        makeEntry({
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        }),
      ],
      [],
      null
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 56. Rollback exact-state integrity
 * --------------------------------------------------------------------------
 */

test(
  "rollback restores exact pre-migration manifest",
  () => {
    const manifest = [
      makeEntry({
        sourceId:
          "location-pilibhit",
        locationType:
          "DISTRICT",
        route:
          "/pilibhit/",
        canonical:
          "/pilibhit/",
        previousRoutes: [
          "/old-pilibhit/",
        ],
      }),
      makeEntry({
        sourceId:
          "location-bareilly",
        locationType:
          "DISTRICT",
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
        previousRoutes: [
          "/old-bareilly/",
        ],
      }),
    ];

    const expected =
      JSON.stringify(
        manifest
          .map(
            normalizeManifestEntry
          )
          .sort(
            (a, b) =>
              a.sourceId.localeCompare(
                b.sourceId
              )
          )
      );

    const result =
      migrateLocations(
        manifest,
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
              "location-pilibhit",
            locationType:
              "DISTRICT",
            newRoute:
              "/uttar-pradesh/pilibhit/",
          },
        ]
      );

    const rollback =
      rollbackMigration(
        result.rollback
      );

    assert.strictEqual(
      rollback.status,
      "ROLLBACK-PASS"
    );

    assert.strictEqual(
      JSON.stringify(
        rollback.manifest
      ),
      expected
    );
  }
);

test(
  "rollback snapshot hash matches its exact manifest",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            sourceId:
              "location-bareilly",
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
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
      result.rollback.sha256,
      sha256Json(
        result.rollback.manifest
      )
    );
  }
);

test(
  "rollback snapshot is sorted by sourceId",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            sourceId:
              "location-pilibhit",
            locationType:
              "DISTRICT",
            route:
              "/pilibhit/",
            canonical:
              "/pilibhit/",
            previousRoutes: [],
          }),
          makeEntry({
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
        ],
        []
      );

    assert.deepStrictEqual(
      result.rollback.manifest.map(
        (entry) =>
          entry.sourceId
      ),
      [
        "location-bareilly",
        "location-pilibhit",
      ]
    );
  }
);

expectThrow(
  "rollback rejects tampered snapshot route",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
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

    const tampered =
      JSON.parse(
        JSON.stringify(
          result.rollback
        )
      );

    tampered.manifest[0].route =
      "/tampered/";

    rollbackMigration(
      tampered
    );
  }
);

expectThrow(
  "rollback rejects tampered snapshot previousRoutes",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
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

    const tampered =
      JSON.parse(
        JSON.stringify(
          result.rollback
        )
      );

    tampered.manifest[0]
      .previousRoutes.push(
        "/tampered-history/"
      );

    rollbackMigration(
      tampered
    );
  }
);

expectThrow(
  "rollback rejects tampered snapshot sourceId",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
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

    const tampered =
      JSON.parse(
        JSON.stringify(
          result.rollback
        )
      );

    tampered.manifest[0].sourceId =
      "location-tampered";

    rollbackMigration(
      tampered
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 57. Options / generator-version integrity
 * --------------------------------------------------------------------------
 */

test(
  "migration uses default generator version when no option is supplied",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
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
      result.migratedManifest[0]
        .generatorVersion,
      "location-migration-v1"
    );
  }
);

test(
  "explicit generator version propagates to migrated entry",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
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
        ],
        {
          generatorVersion:
            "location-migration-v2"
        }
      );

    assert.strictEqual(
      result.migratedManifest[0]
        .generatorVersion,
      "location-migration-v2"
    );
  }
);

expectThrow(
  "empty generator version option is rejected",
  () => {
    migrateLocations(
      [
        makeEntry({
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        }),
      ],
      [],
      {
        generatorVersion:
          ""
      }
    );
  }
);

expectThrow(
  "non-string generator version option is rejected",
  () => {
    migrateLocations(
      [
        makeEntry({
          route:
            "/bareilly/",
          canonical:
            "/bareilly/",
          previousRoutes: [],
        }),
      ],
      [],
      {
        generatorVersion:
          123
      }
    );
  }
);

test(
  "explicit generator version is applied consistently to multiple migrations",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
          makeEntry({
            sourceId:
              "location-pilibhit",
            locationType:
              "DISTRICT",
            route:
              "/pilibhit/",
            canonical:
              "/pilibhit/",
            previousRoutes: [],
          }),
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
              "location-pilibhit",
            locationType:
              "DISTRICT",
            newRoute:
              "/uttar-pradesh/pilibhit/",
          },
        ],
        {
          generatorVersion:
            "location-migration-v3"
        }
      );

    for (
      const entry
      of result.migratedManifest
    ) {
      assert.strictEqual(
        entry.generatorVersion,
        "location-migration-v3"
      );
    }
  }
);

test(
  "generator version change does not alter rollback snapshot",
  () => {
    const manifest = [
      makeEntry({
        sourceId:
          "location-bareilly",
        locationType:
          "DISTRICT",
        route:
          "/bareilly/",
        canonical:
          "/bareilly/",
        previousRoutes: [],
      }),
    ];

    const result =
      migrateLocations(
        manifest,
        [
          {
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            newRoute:
              "/uttar-pradesh/bareilly/",
          },
        ],
        {
          generatorVersion:
            "location-migration-v99"
        }
      );

    const rollback =
      rollbackMigration(
        result.rollback
      );

    assert.strictEqual(
      rollback.status,
      "ROLLBACK-PASS"
    );

    assert.strictEqual(
      rollback.manifest[0]
        .generatorVersion,
      manifest[0]
        .generatorVersion
    );

    assert.strictEqual(
      rollback.sha256,
      sha256Json(
        rollback.manifest
      )
    );
  }
);
/*
 * --------------------------------------------------------------------------
 * 58. Migration result contract integrity
 * --------------------------------------------------------------------------
 */

test(
  "migration result exposes the complete required output contract",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
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
      Object.prototype.hasOwnProperty.call(
        result,
        "migratedManifest"
      )
    );

    assert.ok(
      Object.prototype.hasOwnProperty.call(
        result,
        "redirects"
      )
    );

    assert.ok(
      Object.prototype.hasOwnProperty.call(
        result,
        "sitemapRoutes"
      )
    );

    assert.ok(
      Object.prototype.hasOwnProperty.call(
        result,
        "rollback"
      )
    );

    assert.ok(
      Object.prototype.hasOwnProperty.call(
        result,
        "summary"
      )
    );

    assert.ok(
      result.summary &&
      typeof result.summary ===
        "object"
    );

    assert.strictEqual(
      result.summary.status,
      "PASS"
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
      typeof result.rollback ===
        "object"
    );
  }
);

test(
  "successful migration returns exactly one redirect for one route change",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
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
      result.redirects.length,
      1
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
      result.redirects[0].status,
      REDIRECT_STATUS
    );
  }
);

test(
  "sitemapRoutes contains only current migrated routes",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
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

    assert.deepStrictEqual(
      result.sitemapRoutes,
      [
        "/uttar-pradesh/bareilly/",
      ]
    );

    assert.ok(
      !result.sitemapRoutes.includes(
        "/bareilly/"
      )
    );
  }
);

test(
  "rollback output contains the pre-migration route",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
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
      result.rollback.manifest[0]
        .route,
      "/bareilly/"
    );

    assert.strictEqual(
      result.rollback.manifest[0]
        .canonical,
      "/bareilly/"
    );

    assert.ok(
      !result.rollback.manifest[0]
        .previousRoutes.includes(
          "/uttar-pradesh/bareilly/"
        )
    );
  }
);

test(
  "no-op migration keeps result contract valid",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
        ],
        [
          {
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            newRoute:
              "/bareilly/",
          },
        ]
      );

    assert.strictEqual(
      result.summary.status,
      "PASS"
    );

    assert.deepStrictEqual(
      result.redirects,
      []
    );

    assert.deepStrictEqual(
      result.sitemapRoutes,
      [
        "/bareilly/",
      ]
    );

    assert.ok(
      Array.isArray(
        result.migratedManifest
      )
    );

    assert.ok(
      result.rollback &&
      typeof result.rollback ===
        "object"
    );
  }
);

test(
  "multiple migrations return aligned manifest, redirects and sitemap output",
  () => {
    const result =
      migrateLocations(
        [
          makeEntry({
            sourceId:
              "location-bareilly",
            locationType:
              "DISTRICT",
            route:
              "/bareilly/",
            canonical:
              "/bareilly/",
            previousRoutes: [],
          }),
          makeEntry({
            sourceId:
              "location-pilibhit",
            locationType:
              "DISTRICT",
            route:
              "/pilibhit/",
            canonical:
              "/pilibhit/",
            previousRoutes: [],
          }),
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
              "location-pilibhit",
            locationType:
              "DISTRICT",
            newRoute:
              "/uttar-pradesh/pilibhit/",
          },
        ]
      );

    assert.strictEqual(
      result.migratedManifest.length,
      2
    );

    assert.strictEqual(
      result.redirects.length,
      2
    );

    assert.strictEqual(
      result.sitemapRoutes.length,
      2
    );

    assert.deepStrictEqual(
      result.sitemapRoutes,
      [
        "/uttar-pradesh/bareilly/",
        "/uttar-pradesh/pilibhit/",
      ]
    );

    assert.deepStrictEqual(
      result.redirects.map(
        (item) => item.from
      ),
      [
        "/bareilly/",
        "/pilibhit/",
      ]
    );

    assert.deepStrictEqual(
      result.redirects.map(
        (item) => item.to
      ),
      [
        "/uttar-pradesh/bareilly/",
        "/uttar-pradesh/pilibhit/",
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
