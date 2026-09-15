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
      `      ${error && error.message ? error.message : error}`
    );
    throw error;
  }
}

function expectFail(name, fn, expectedMessage) {
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
    const result = validateRows([
      row()
    ]);

    assert.equal(result.length, 1);
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
      row({ id: "not-a-uuid" })
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
    const result = validateRows([
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
          "//evil.example/tehsil/bareilly
