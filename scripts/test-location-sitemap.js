/**
 * Instant Legal Services
 * Location Sitemap Generator - Adversarial Test Harness
 *
 * Purpose:
 * - Test scripts/location-sitemap.js in isolation.
 * - Dependency-free: Node.js built-ins only.
 * - No database access.
 * - No filesystem writes.
 * - No Git operations.
 * - No network access.
 *
 * Run:
 *   node scripts/test-location-sitemap.js
 */

"use strict";

const assert = require("node:assert/strict");

const {
  ALLOWED_LOCATION_TYPES,
  validateRows,
  generateLocationSitemap,
  validateGeneratedSitemap,
  buildLocationSitemap
} = require("./location-sitemap");

const VALID_UUID =
  "550e8400-e29b-41d4-a716-446655440000";

const VALID_UUID_2 =
  "6ba7b810-9dad-51d1-80b4-00c04fd430c8";

const VALID_UUID_3 =
  "6ba7b811-9dad-51d1-80b4-00c04fd430c8";

function row(overrides = {}) {
  return {
    id: VALID_UUID,
    location_type: "TEHSIL",
    canonical_name: "Bareilly",
    canonical_slug: "bareilly",
    current_route: "/tehsil/bareilly/",
    ...overrides
  };
}

function expectPass(name, fn) {
  try {
    fn();

    console.log(`PASS  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);

    console.error(
      `      ${
        error && error.message
          ? error.message
          : error
      }`
    );

    throw error;
  }
}

function expectFail(
  name,
  fn,
  expectedMessage
) {
  try {
    fn();
  } catch (error) {
    const message =
      error && error.message
        ? error.message
        : String(error);

    if (
      expectedMessage &&
      !message.includes(expectedMessage)
    ) {
      throw new Error(
        `${name} failed for wrong reason.\n` +
        `Expected message containing: ${expectedMessage}\n` +
        `Actual message: ${message}`
      );
    }

    console.log(`PASS  ${name}`);

    return;
  }

  throw new Error(
    `FAIL  ${name}: expected validation failure`
  );
}

/*
 * ---------------------------------------------------------
 * 1. Module export / basic contract tests
 * ---------------------------------------------------------
 */

expectPass(
  "module exports required functions",
  () => {
    assert.ok(
      ALLOWED_LOCATION_TYPES instanceof Set
    );

    assert.equal(
      typeof validateRows,
      "function"
    );

    assert.equal(
      typeof generateLocationSitemap,
      "function"
    );

    assert.equal(
      typeof validateGeneratedSitemap,
      "function"
    );

    assert.equal(
      typeof buildLocationSitemap,
      "function"
    );
  }
);

expectPass(
  "allowed location types are exactly frozen scope",
  () => {
    assert.deepEqual(
      [...ALLOWED_LOCATION_TYPES].sort(),
      [
        "AUTHORITY",
        "DISTRICT",
        "LOCAL_BODY",
        "STATE",
        "TEHSIL"
      ]
    );
  }
);

/*
 * ---------------------------------------------------------
 * 2. Positive identity / route tests
 * ---------------------------------------------------------
 */

expectPass(
  "valid TEHSIL row",
  () => {
    const result =
      validateRows([
        row()
      ]);

    assert.equal(
      result.length,
      1
    );

    assert.equal(
      result[0].id,
      VALID_UUID
    );

    assert.equal(
      result[0].current_route,
      "/tehsil/bareilly/"
    );
  }
);

expectPass(
  "valid LOCAL_BODY row",
  () => {
    validateRows([
      row({
        id: VALID_UUID_2,
        location_type: "LOCAL_BODY",
        canonical_name:
          "Bareilly Nagar Nigam",
        canonical_slug:
          "bareilly-nagar-nigam",
        current_route:
          "/local-body/bareilly-nagar-nigam/"
      })
    ]);
  }
);

expectPass(
  "valid AUTHORITY row",
  () => {
    validateRows([
      row({
        id: VALID_UUID_3,
        location_type: "AUTHORITY",
        canonical_name:
          "Bareilly Development Authority",
        canonical_slug:
          "bareilly-development-authority",
        current_route:
          "/authority/bareilly-development-authority/"
      })
    ]);
  }
);

/*
 * ---------------------------------------------------------
 * 3. UUID attack tests
 * ---------------------------------------------------------
 */

expectFail(
  "reject missing UUID",
  () => {
    validateRows([
      row({ id: "" })
    ]);
  },
  "id must be a non-empty string"
);

expectFail(
  "reject arbitrary string as UUID",
  () => {
    validateRows([
      row({
        id: "not-a-uuid"
      })
    ]);
  },
  "id must be a valid UUID"
);

expectFail(
  "reject numeric ID",
  () => {
    validateRows([
      row({ id: 123 })
    ]);
  },
  "id must be a non-empty string"
);

expectFail(
  "reject UUID with invalid variant",
  () => {
    validateRows([
      row({
        id:
          "550e8400-e29b-41d4-c716-446655440000"
      })
    ]);
  },
  "id must be a valid UUID"
);

expectFail(
  "reject UUID with invalid version",
  () => {
    validateRows([
      row({
        id:
          "550e8400-e29b-61d4-a716-446655440000"
      })
    ]);
  },
  "id must be a valid UUID"
);

expectPass(
  "accept uppercase hexadecimal UUID",
  () => {
    const result =
      validateRows([
        row({
          id:
            "550E8400-E29B-41D4-A716-446655440000"
        })
      ]);

    assert.equal(
      result[0].id,
      VALID_UUID
    );
  }
);

/*
 * ---------------------------------------------------------
 * 4. Duplicate identity / route tests
 * ---------------------------------------------------------
 */

expectFail(
  "reject duplicate location ID",
  () => {
    validateRows([
      row(),

      row({
        canonical_name:
          "Another Bareilly",
        canonical_slug:
          "another-bareilly",
        current_route:
          "/tehsil/another-bareilly/"
      })
    ]);
  },
  "Duplicate location id"
);

expectFail(
  "reject duplicate current route",
  () => {
    validateRows([
      row(),

      row({
        id: VALID_UUID_2,
        canonical_name:
          "Another Name",
        canonical_slug:
          "another-name"
      })
    ]);
  },
  "Duplicate current route"
);

/*
 * ---------------------------------------------------------
 * 5. Slug validation tests
 * ---------------------------------------------------------
 */

expectPass(
  "accept valid hyphenated slug",
  () => {
    validateRows([
      row({
        canonical_slug:
          "bareilly-city",
        current_route:
          "/tehsil/bareilly-city/"
      })
    ]);
  }
);

expectFail(
  "reject uppercase slug",
  () => {
    validateRows([
      row({
        canonical_slug:
          "Bareilly",
        current_route:
          "/tehsil/Bareilly/"
      })
    ]);
  },
  "canonical_slug must be lowercase"
);

expectFail(
  "reject slug containing underscore",
  () => {
    validateRows([
      row({
        canonical_slug:
          "bareilly_city",
        current_route:
          "/tehsil/bareilly_city/"
      })
    ]);
  },
  "canonical_slug is not a valid canonical slug"
);

expectFail(
  "reject slug containing slash",
  () => {
    validateRows([
      row({
        canonical_slug:
          "bareilly/city",
        current_route:
          "/tehsil/bareilly/city/"
      })
    ]);
  },
  "canonical_slug is not a valid canonical slug"
);

expectFail(
  "reject slug containing whitespace",
  () => {
    validateRows([
      row({
        canonical_slug:
          "bareilly city",
        current_route:
          "/tehsil/bareilly-city/"
      })
    ]);
  },
  "canonical_slug is not a valid canonical slug"
);

expectFail(
  "reject slug beginning with hyphen",
  () => {
    validateRows([
      row({
        canonical_slug:
          "-bareilly",
        current_route:
          "/tehsil/-bareilly/"
      })
    ]);
  },
  "canonical_slug is not a valid canonical slug"
);

expectFail(
  "reject slug ending with hyphen",
  () => {
    validateRows([
      row({
        canonical_slug:
          "bareilly-",
        current_route:
          "/tehsil/bareilly-/"
      })
    ]);
  },
  "canonical_slug is not a valid canonical slug"
);

/*
 * ---------------------------------------------------------
 * 6. Typed route ↔ slug integrity tests
 * ---------------------------------------------------------
 */

expectFail(
  "reject TEHSIL route/slug mismatch",
  () => {
    validateRows([
      row({
        canonical_slug:
          "bareilly",
        current_route:
          "/tehsil/rampur/"
      })
    ]);
  },
  "current_route does not match TEHSIL canonical_slug"
);

expectFail(
  "reject LOCAL_BODY route/slug mismatch",
  () => {
    validateRows([
      row({
        location_type:
          "LOCAL_BODY",
        canonical_slug:
          "bareilly-nagar-nigam",
        current_route:
          "/local-body/bareilly/"
      })
    ]);
  },
  "current_route does not match LOCAL_BODY canonical_slug"
);

expectFail(
  "reject AUTHORITY route/slug mismatch",
  () => {
    validateRows([
      row({
        location_type:
          "AUTHORITY",
        canonical_slug:
          "bareilly-development-authority",
        current_route:
          "/authority/bareilly/"
      })
    ]);
  },
  "current_route does not match AUTHORITY canonical_slug"
);

/*
 * ---------------------------------------------------------
 * 7. Legacy STATE / DISTRICT compatibility tests
 * ---------------------------------------------------------
 */

expectPass(
  "STATE remains compatible with legacy route ownership",
  () => {
    validateRows([
      row({
        location_type:
          "STATE",
        canonical_name:
          "Uttar Pradesh",
        canonical_slug:
          "uttar-pradesh",
        current_route:
          "/state/uttar-pradesh/"
      })
    ]);
  }
);

expectPass(
  "DISTRICT remains compatible with legacy route ownership",
  () => {
    validateRows([
      row({
        location_type:
          "DISTRICT",
        canonical_name:
          "Bareilly",
        canonical_slug:
          "bareilly",
        current_route:
          "/district/bareilly/"
      })
    ]);
  }
);

/*
 * ---------------------------------------------------------
 * 8. Location type validation
 * ---------------------------------------------------------
 */

expectFail(
  "reject unsupported location type",
  () => {
    validateRows([
      row({
        location_type:
          "COURT"
      })
    ]);
  },
  "Unsupported location_type"
);

expectFail(
  "reject empty location type",
  () => {
    validateRows([
      row({
        location_type:
          ""
      })
    ]);
  },
  "location_type must be a non-empty string"
);

/*
 * ---------------------------------------------------------
 * 9. Canonical route attacks
 * ---------------------------------------------------------
 */

expectFail(
  "reject HTTP route",
  () => {
    validateRows([
      row({
        current_route:
          "http://instantlegalservices.in/tehsil/bareilly/"
      })
    ]);
  },
  "is not a canonical route"
);

expectFail(
  "reject external host route",
  () => {
    validateRows([
      row({
        current_route:
          "//evil.example/tehsil/bareilly/"
      })
    ]);
  },
  "Canonical URL has invalid hostname"
);

expectFail(
  "reject query string",
  () => {
    validateRows([
      row({
        current_route:
          "/tehsil/bareilly/?x=1"
      })
    ]);
  },
  "canonical route"
);

expectFail(
  "reject fragment",
  () => {
    validateRows([
      row({
        current_route:
          "/tehsil/bareilly/#test"
      })
    ]);
  },
  "canonical route"
);

expectFail(
  "reject username/password URL component",
  () => {
    validateRows([
      row({
        current_route:
          "//user:pass@instantlegalservices.in/tehsil/bareilly/"
      })
    ]);
  },
  "Canonical URL contains forbidden URL components"
);

expectFail(
  "reject backslash",
  () => {
    validateRows([
      row({
        current_route:
          "/tehsil/bareilly\\/"
      })
    ]);
  },
  "must not contain backslashes"
);

expectFail(
  "reject dot segment",
  () => {
    validateRows([
      row({
        current_route:
          "/tehsil/./bareilly/"
      })
    ]);
  },
  "must not contain dot-segments"
);

expectFail(
  "reject parent dot segment",
  () => {
    validateRows([
      row({
        current_route:
          "/tehsil/../bareilly/"
      })
    ]);
  },
  "must not contain dot-segments"
);

expectFail(
  "reject leading whitespace",
  () => {
    validateRows([
      row({
        current_route:
          " /tehsil/bareilly/"
      })
    ]);
  },
  "leading or trailing whitespace"
);

expectFail(
  "reject trailing whitespace",
  () => {
    validateRows([
      row({
        current_route:
          "/tehsil/bareilly/ "
      })
    ]);
  },
  "leading or trailing whitespace"
);

expectFail(
  "reject control character",
  () => {
    validateRows([
      row({
        current_route:
          "/tehsil/bareilly\u0000/"
      })
    ]);
  },
  "control characters"
);

/*
 * ---------------------------------------------------------
 * 10. Row shape / input attacks
 * ---------------------------------------------------------
 */

expectFail(
  "reject non-array input",
  () => {
    validateRows(null);
  },
  "input must be an array"
);

expectFail(
  "reject object input",
  () => {
    validateRows({});
  },
  "input must be an array"
);

expectFail(
  "reject null row",
  () => {
    validateRows([null]);
  },
  "Invalid Location Registry row"
);

expectFail(
  "reject array row",
  () => {
    validateRows([[]]);
  },
  "Invalid Location Registry row"
);

expectFail(
  "reject primitive row",
  () => {
    validateRows(["bad"]);
  },
  "Invalid Location Registry row"
);

/*
 * ---------------------------------------------------------
 * 11. Empty feed
 * ---------------------------------------------------------
 */

expectPass(
  "empty feed generates valid empty sitemap",
  () => {
    const xml =
      buildLocationSitemap([]);

    assert.equal(
      validateGeneratedSitemap(xml),
      true
    );

    assert.match(
      xml,
      /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/
    );

    assert.doesNotMatch(
      xml,
      /<loc>/
    );
  }
);

/*
 * ---------------------------------------------------------
 * 12. Deterministic ordering
 * ---------------------------------------------------------
 */

expectPass(
  "rows are deterministically sorted",
  () => {
    const rows = [
      row({
        id: VALID_UUID_3,
        canonical_name:
          "Zeta",
        canonical_slug:
          "zeta",
        current_route:
          "/tehsil/zeta/"
      }),

      row({
        id: VALID_UUID_2,
        canonical_name:
          "Alpha",
        canonical_slug:
          "alpha",
        current_route:
          "/tehsil/alpha/"
      }),

      row({
        id: VALID_UUID,
        canonical_name:
          "Beta",
        canonical_slug:
          "beta",
        current_route:
          "/tehsil/beta/"
      })
    ];

    const result =
      validateRows(rows);

    assert.deepEqual(
      result.map(
        item =>
          item.canonical_name
      ),
      [
        "Alpha",
        "Beta",
        "Zeta"
      ]
    );
  }
);

/*
 * ---------------------------------------------------------
 * 13. XML generation
 * ---------------------------------------------------------
 */

expectPass(
  "XML generation succeeds for valid rows",
  () => {
    const xml =
      generateLocationSitemap([
        row()
      ]);

    assert.match(
      xml,
      /<url>/
    );

    assert.match(
      xml,
      /<loc>https:\/\/instantlegalservices\.in\/tehsil\/bareilly\/<\/loc>/
    );

    assert.match(
      xml,
      /<\/urlset>/
    );
  }
);

expectPass(
  "generated XML has exactly one loc per url",
  () => {
    const xml =
      generateLocationSitemap([
        row(),

        row({
          id: VALID_UUID_2,
          location_type:
            "LOCAL_BODY",
          canonical_name:
            "Bareilly Nagar Nigam",
          canonical_slug:
            "bareilly-nagar-nigam",
          current_route:
            "/local-body/bareilly-nagar-nigam/"
        })
      ]);

    assert.equal(
      (xml.match(/<url>/g) || [])
        .length,
      2
    );

    assert.equal(
      (xml.match(/<loc>/g) || [])
        .length,
      2
    );
  }
);

/*
 * ---------------------------------------------------------
 * 13A. Sitemap <loc> length boundary tests
 *
 * Official Sitemap protocol:
 * <loc> must be less than 2,048 characters.
 * Therefore:
 * - 2047 = PASS
 * - 2048 = FAIL
 * ---------------------------------------------------------
 */

expectPass(
  "accept canonical URL at 2047 characters",
  () => {
    const absolutePrefix =
      "https://instantlegalservices.in/tehsil/";

    const slugLength =
      2047 -
      absolutePrefix.length -
      1;

    const slug =
      "a".repeat(slugLength);

    const route =
      `/tehsil/${slug}/`;

    assert.equal(
      `https://instantlegalservices.in${route}`.length,
      2047
    );

    validateRows([
      row({
        canonical_slug:
          slug,
        current_route:
          route
      })
    ]);
  }
);

expectFail(
  "reject canonical URL at 2048 characters",
  () => {
    const absolutePrefix =
      "https://instantlegalservices.in/tehsil/";

    const slugLength =
      2048 -
      absolutePrefix.length -
      1;

    const slug =
      "a".repeat(slugLength);

    const route =
      `/tehsil/${slug}/`;

    assert.equal(
      `https://instantlegalservices.in${route}`.length,
      2048
    );

    validateRows([
      row({
        canonical_slug:
          slug,
        current_route:
          route
      })
    ]);
  },
  "exceeds the Sitemap <loc> maximum length of 2048 characters"
);

/*
 * ---------------------------------------------------------
 * 13B. Strict <url> / <loc> structural tests
 * ---------------------------------------------------------
 */

expectFail(
  "reject sitemap with two url elements but only one loc",
  () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      "  <url>\n" +
      "    <loc>https://instantlegalservices.in/tehsil/bareilly/</loc>\n" +
      "  </url>\n" +
      "  <url>\n" +
      "  </url>\n" +
      "</urlset>\n";

    validateGeneratedSitemap(xml);
  },
  "exactly one <loc> per <url>"
);

expectFail(
  "reject sitemap with one url element but two loc elements",
  () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      "  <url>\n" +
      "    <loc>https://instantlegalservices.in/tehsil/bareilly/</loc>\n" +
      "    <loc>https://instantlegalservices.in/tehsil/rampur/</loc>\n" +
      "  </url>\n" +
      "</urlset>\n";

    validateGeneratedSitemap(xml);
  },
  "exactly one <loc> per <url>"
);

expectFail(
  "reject sitemap loc outside url element",
  () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      "  <loc>https://instantlegalservices.in/tehsil/bareilly/</loc>\n" +
      "</urlset>\n";

    validateGeneratedSitemap(xml);
  },
  "exactly one <loc> per <url>"
);

/*
 * ---------------------------------------------------------
 * 13C. XML protocol / encoding tests
 * ---------------------------------------------------------
 */

expectPass(
  "generated sitemap declares UTF-8",
  () => {
    const xml =
      generateLocationSitemap([
        row()
      ]);

    assert.ok(
      xml.startsWith(
        '<?xml version="1.0" encoding="UTF-8"?>'
      )
    );
  }
);

expectPass(
  "XML special characters are safely escaped and validated",
  () => {
    const xml =
      generateLocationSitemap([
        row({
          location_type:
            "STATE",
          canonical_name:
            "A & B < Test >",
          canonical_slug:
            "a-b",
          current_route:
            "/state/a-&-b/"
        })
      ]);

    assert.match(
      xml,
      /\/state\/a-&amp;-b\//
    );

    assert.doesNotMatch(
      xml,
      /\/state\/a-&-b\//
    );

    assert.equal(
      validateGeneratedSitemap(xml),
      true
    );
  }
);

/*
 * ---------------------------------------------------------
 * 14. Historical-route isolation
 * ---------------------------------------------------------
 */

expectPass(
  "sitemap contains only current_route",
  () => {
    const xml =
      generateLocationSitemap([
        row()
      ]);

    assert.match(
      xml,
      /\/tehsil\/bareilly\//
    );

    /*
     * This module has no previous_routes input
     * and therefore cannot emit historical routes.
     */

    assert.equal(
      (xml.match(/<loc>/g) || [])
        .length,
      1
    );
  }
);

/*
 * ---------------------------------------------------------
 * 15. Generated XML validation attacks
 * ---------------------------------------------------------
 */

expectFail(
  "reject non-string generated XML",
  () => {
    validateGeneratedSitemap(null);
  },
  "Generated sitemap must be a string"
);

expectFail(
  "reject empty generated XML",
  () => {
    validateGeneratedSitemap("");
  },
  "Generated sitemap must not be empty"
);

expectFail(
  "reject malformed XML declaration",
  () => {
    validateGeneratedSitemap(
      "<urlset></urlset>"
    );
  },
  "Invalid sitemap XML declaration"
);

expectFail(
  "reject missing urlset namespace",
  () => {
    validateGeneratedSitemap(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      "<urlset></urlset>"
    );
  },
  "Invalid sitemap urlset namespace"
);

expectFail(
  "reject unclosed urlset",
  () => {
    validateGeneratedSitemap(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    );
  },
  "Sitemap urlset is not closed"
);

expectFail(
  "reject duplicate sitemap locations",
  () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      "  <url>\n" +
      "    <loc>https://instantlegalservices.in/tehsil/bareilly/</loc>\n" +
      "  </url>\n" +
      "  <url>\n" +
      "    <loc>https://instantlegalservices.in/tehsil/bareilly/</loc>\n" +
      "  </url>\n" +
      "</urlset>\n";

    validateGeneratedSitemap(xml);
  },
  "Duplicate sitemap <loc>"
);

/*
 * ---------------------------------------------------------
 * 16. Full pipeline
 * ---------------------------------------------------------
 */

expectPass(
  "full build pipeline succeeds",
  () => {
    const xml =
      buildLocationSitemap([
        row(),

        row({
          id: VALID_UUID_2,
          location_type:
            "LOCAL_BODY",
          canonical_name:
            "Bareilly Nagar Nigam",
          canonical_slug:
            "bareilly-nagar-nigam",
          current_route:
            "/local-body/bareilly-nagar-nigam/"
        }),

        row({
          id: VALID_UUID_3,
          location_type:
            "AUTHORITY",
          canonical_name:
            "Bareilly Development Authority",
          canonical_slug:
            "bareilly-development-authority",
          current_route:
            "/authority/bareilly-development-authority/"
        })
      ]);

    assert.equal(
      validateGeneratedSitemap(xml),
      true
    );

    assert.equal(
      (xml.match(/<loc>/g) || [])
        .length,
      3
    );
  }
);

/*
 * ---------------------------------------------------------
 * Final result
 * ---------------------------------------------------------
 */

console.log("");

console.log(
  "1088.370 LOCATION SITEMAP ADVERSARIAL TEST SUITE: PASS"
);

console.log(
  "All dependency-free assertions completed successfully."
);

console.log(
  "No database, filesystem, network, Git, or production side effects are used."
);
