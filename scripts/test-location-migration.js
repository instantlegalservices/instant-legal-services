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
