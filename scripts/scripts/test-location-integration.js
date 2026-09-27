/**
 * Instant Legal Services
 * Location Registry -> Location Sitemap
 * Integration Contract Test
 *
 * Purpose:
 * - Verify the validated Registry feed contract
 *   is compatible with the Location Sitemap generator.
 * - Verify current routes flow into sitemap output.
 * - Verify historical routes remain outside sitemap output.
 * - No database access.
 * - No network access.
 * - No filesystem writes.
 * - No Git operations.
 */

"use strict";

const assert =
  require("node:assert/strict");

const {
  validateCurrentFeed,
  validateRedirectFeed
} =
  require("./location-registry-feed");

const {
  validateRows,
  generateLocationSitemap,
  validateGeneratedSitemap
} =
  require("./location-sitemap");

const UUID_1 =
  "550e8400-e29b-41d4-a716-446655440000";

const UUID_2 =
  "6ba7b810-9dad-51d1-80b4-00c04fd430c8";

const UUID_3 =
  "6ba7b811-9dad-51d1-80b4-00c04fd430c8";

const UUID_4 =
  "6ba7b812-9dad-51d1-80b4-00c04fd430c8";

const UUID_5 =
  "6ba7b813-9dad-51d1-80b4-00c04fd430c8";

function expectPass(
  name,
  fn
) {
  try {
    fn();

    console.log(
      `PASS: ${name}`
    );
  } catch (error) {
    console.error(
      `FAIL: ${name}`
    );

    console.error(
      error &&
      error.message
        ? error.message
        : error
    );

    throw error;
  }
}

function expectFail(
  name,
  fn
) {
  try {
    fn();
  } catch {
    console.log(
      `PASS: ${name}`
    );

    return;
  }

  throw new Error(
    `FAIL: ${name}: expected validation failure`
  );
}

/*
 * --------------------------------------------------------------------------
 * Shared valid Registry fixture
 * --------------------------------------------------------------------------
 */

function buildCurrentFeed() {
  return [
    {
      id:
        UUID_1,

      location_type:
        "STATE",

      canonical_name:
        "Uttar Pradesh",

      canonical_slug:
        "uttar-pradesh",

      current_route:
        "/state/uttar-pradesh/"
    },

    {
      id:
        UUID_2,

      location_type:
        "DISTRICT",

      canonical_name:
        "Bareilly",

      canonical_slug:
        "bareilly",

      current_route:
        "/district/bareilly/"
    },

    {
      id:
        UUID_3,

      location_type:
        "TEHSIL",

      canonical_name:
        "Bareilly",

      canonical_slug:
        "bareilly",

      current_route:
        "/tehsil/bareilly/"
    },

    {
      id:
        UUID_4,

      location_type:
        "LOCAL_BODY",

      canonical_name:
        "Bareilly Nagar Nigam",

      canonical_slug:
        "bareilly-nagar-nigam",

      current_route:
        "/local-body/bareilly-nagar-nigam/"
    },

    {
      id:
        UUID_5,

      location_type:
        "AUTHORITY",

      canonical_name:
        "Bareilly Development Authority",

      canonical_slug:
        "bareilly-development-authority",

      current_route:
        "/authority/bareilly-development-authority/"
    }
  ];
}

/*
 * --------------------------------------------------------------------------
 * 1. Registry feed validation
 * --------------------------------------------------------------------------
 */

expectPass(
  "valid Registry current feed passes validation",
  () => {
    const raw =
      buildCurrentFeed();

    const result =
      validateCurrentFeed(
        raw
      );

    assert.equal(
      result.length,
      raw.length
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 2. Registry -> Sitemap contract
 * --------------------------------------------------------------------------
 */

expectPass(
  "validated Registry current feed is accepted by sitemap validator",
  () => {
    const current =
      validateCurrentFeed(
        buildCurrentFeed()
      );

    const sitemapRows =
      validateRows(
        current
      );

    assert.equal(
      sitemapRows.length,
      current.length
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 3. Stable identity preservation
 * --------------------------------------------------------------------------
 */

expectPass(
  "Registry IDs survive the feed-to-sitemap boundary",
  () => {
    const current =
      validateCurrentFeed(
        buildCurrentFeed()
      );

    const sitemapRows =
      validateRows(
        current
      );

    assert.deepEqual(
      sitemapRows.map(
        row => row.id
      ).sort(),
      current.map(
        row => row.id
      ).sort()
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 4. Current route preservation
 * --------------------------------------------------------------------------
 */

expectPass(
  "current_route values survive the feed-to-sitemap boundary",
  () => {
    const current =
      validateCurrentFeed(
        buildCurrentFeed()
      );

    const sitemapRows =
      validateRows(
        current
      );

    assert.deepEqual(
      sitemapRows.map(
        row => row.current_route
      ).sort(),
      current.map(
        row => row.current_route
      ).sort()
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 5. Current routes become sitemap locations
 * --------------------------------------------------------------------------
 */

expectPass(
  "Registry current routes are emitted into sitemap",
  () => {
    const current =
      validateCurrentFeed(
        buildCurrentFeed()
      );

    const xml =
      generateLocationSitemap(
        current
      );

    assert.equal(
      validateGeneratedSitemap(
        xml
      ),
      true
    );

    for (
      const row
      of current
    ) {
      assert.ok(
        xml.includes(
          `<loc>https://instantlegalservices.in${row.current_route}</loc>`
        )
      );
    }
  }
);

/*
 * --------------------------------------------------------------------------
 * 6. Historical redirect feed
 * --------------------------------------------------------------------------
 */

expectPass(
  "valid historical redirect feed passes validation",
  () => {
    const current =
      validateCurrentFeed(
        buildCurrentFeed()
      );

    const redirects =
      validateRedirectFeed(
        [
          {
            location_id:
              UUID_3,

            route:
              "/tehsil/old-bareilly/",

            redirect_to:
              "/tehsil/bareilly/"
          },

          {
            location_id:
              UUID_4,

            route:
              "/local-body/old-bareilly-nagar/",

            redirect_to:
              "/local-body/bareilly-nagar-nigam/"
          }
        ],
        current
      );

    assert.equal(
      redirects.length,
      2
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 7. Historical routes never enter sitemap
 * --------------------------------------------------------------------------
 */

expectPass(
  "historical redirect routes are excluded from sitemap input",
  () => {
    const current =
      validateCurrentFeed(
        buildCurrentFeed()
      );

    const redirects =
      validateRedirectFeed(
        [
          {
            location_id:
              UUID_3,

            route:
              "/tehsil/old-bareilly/",

            redirect_to:
              "/tehsil/bareilly/"
          }
        ],
        current
      );

    const xml =
      generateLocationSitemap(
        current
      );

    assert.equal(
      validateGeneratedSitemap(
        xml
      ),
      true
    );

    assert.ok(
      xml.includes(
        "/tehsil/bareilly/"
      )
    );

    assert.ok(
      !xml.includes(
        "/tehsil/old-bareilly/"
      )
    );

    assert.equal(
      redirects[0].redirect_to,
      "/tehsil/bareilly/"
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 8. Current route collision
 * --------------------------------------------------------------------------
 */

expectFail(
  "duplicate current route fails at Registry boundary",
  () => {
    const rows =
      buildCurrentFeed();

    rows.push({
      id:
        "6ba7b814-9dad-51d1-80b4-00c04fd430c8",

      location_type:
        "TEHSIL",

      canonical_name:
        "Duplicate",

      canonical_slug:
        "duplicate",

      current_route:
        "/tehsil/bareilly/"
    });

    validateCurrentFeed(
      rows
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 9. Historical route collision
 * --------------------------------------------------------------------------
 */

expectFail(
  "duplicate historical route fails at redirect boundary",
  () => {
    const current =
      validateCurrentFeed(
        buildCurrentFeed()
      );

    validateRedirectFeed(
      [
        {
          location_id:
            UUID_3,

          route:
            "/tehsil/old-bareilly/",

          redirect_to:
            "/tehsil/bareilly/"
        },

        {
          location_id:
            UUID_4,

          route:
            "/tehsil/old-bareilly/",

          redirect_to:
            "/local-body/bareilly-nagar-nigam/"
        }
      ],
      current
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 10. Historical/current collision
 * --------------------------------------------------------------------------
 */

expectFail(
  "historical route cannot also be a current Registry route",
  () => {
    const current =
      validateCurrentFeed(
        buildCurrentFeed()
      );

    validateRedirectFeed(
      [
        {
          location_id:
            UUID_3,

          route:
            "/district/bareilly/",

          redirect_to:
            "/tehsil/bareilly/"
        }
      ],
      current
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 11. Redirect target ownership
 * --------------------------------------------------------------------------
 */

expectFail(
  "redirect target must match the same location current route",
  () => {
    const current =
      validateCurrentFeed(
        buildCurrentFeed()
      );

    validateRedirectFeed(
      [
        {
          location_id:
            UUID_3,

          route:
            "/tehsil/old-bareilly/",

          redirect_to:
            "/local-body/bareilly-nagar-nigam/"
        }
      ],
      current
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 12. No self redirect
 * --------------------------------------------------------------------------
 */

expectFail(
  "historical redirect cannot redirect to itself",
  () => {
    const current =
      validateCurrentFeed(
        buildCurrentFeed()
      );

    validateRedirectFeed(
      [
        {
          location_id:
            UUID_3,

          route:
            "/tehsil/bareilly/",

          redirect_to:
            "/tehsil/bareilly/"
        }
      ],
      current
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 13. Malformed current feed fails closed
 * --------------------------------------------------------------------------
 */

expectFail(
  "malformed Registry row fails closed",
  () => {
    validateCurrentFeed([
      {
        id:
          UUID_1,

        location_type:
          "TEHSIL",

        canonical_name:
          "Bareilly",

        canonical_slug:
          "bareilly"

        /*
         * current_route intentionally missing
         */
      }
    ]);
  }
);

/*
 * --------------------------------------------------------------------------
 * 14. Unsupported type fails closed
 * --------------------------------------------------------------------------
 */

expectFail(
  "unsupported Registry location type fails closed",
  () => {
    validateCurrentFeed([
      {
        id:
          UUID_1,

        location_type:
          "COURT",

        canonical_name:
          "District Court Bareilly",

        canonical_slug:
          "district-court-bareilly",

        current_route:
          "/uttar-pradesh/bareilly/district-court/"
      }
    ]);
  }
);

/*
 * --------------------------------------------------------------------------
 * 15. Invalid typed route fails before sitemap generation
 * --------------------------------------------------------------------------
 */

expectFail(
  "invalid TEHSIL route cannot cross into sitemap",
  () => {
    const current =
      validateCurrentFeed([
        {
          id:
            UUID_1,

          location_type:
            "TEHSIL",

          canonical_name:
            "Bareilly",

          canonical_slug:
            "bareilly",

          current_route:
            "/tehsil/rampur/"
        }
      ]);

    generateLocationSitemap(
      current
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 16. Legacy STATE compatibility
 * --------------------------------------------------------------------------
 */

expectPass(
  "legacy STATE Registry route crosses sitemap boundary",
  () => {
    const current =
      validateCurrentFeed([
        {
          id:
            UUID_1,

          location_type:
            "STATE",

          canonical_name:
            "Uttar Pradesh",

          canonical_slug:
            "uttar-pradesh",

          current_route:
            "/state/uttar-pradesh/"
        }
      ]);

    const xml =
      generateLocationSitemap(
        current
      );

    assert.ok(
      xml.includes(
        "/state/uttar-pradesh/"
      )
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 17. Legacy DISTRICT compatibility
 * --------------------------------------------------------------------------
 */

expectPass(
  "legacy DISTRICT Registry route crosses sitemap boundary",
  () => {
    const current =
      validateCurrentFeed([
        {
          id:
            UUID_1,

          location_type:
            "DISTRICT",

          canonical_name:
            "Bareilly",

          canonical_slug:
            "bareilly",

          current_route:
            "/district/bareilly/"
        }
      ]);

    const xml =
      generateLocationSitemap(
        current
      );

    assert.ok(
      xml.includes(
        "/district/bareilly/"
      )
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 18. Deterministic integration output
 * --------------------------------------------------------------------------
 */

expectPass(
  "feed-to-sitemap output is deterministic",
  () => {
    const rows =
      buildCurrentFeed();

    const first =
      validateCurrentFeed(
        rows
      );

    const second =
      validateCurrentFeed(
        [
          rows[4],
          rows[2],
          rows[0],
          rows[3],
          rows[1]
        ]
      );

    const xmlA =
      generateLocationSitemap(
        first
      );

    const xmlB =
      generateLocationSitemap(
        second
      );

    assert.equal(
      xmlA,
      xmlB
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * Final
 * --------------------------------------------------------------------------
 */

console.log("");
console.log(
  "LOCATION_REGISTRY_SITEMAP_INTEGRATION=PASS"
);
console.log(
  "Registry feed -> sitemap integration contract verified."
);
console.log(
  "No database, filesystem, network, Git, or production side effects used."
);
