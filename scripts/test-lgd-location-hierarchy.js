/**
 * Instant Legal Services
 * LGD Location Hierarchy - Adversarial Test Suite
 *
 * No network.
 * No database.
 * No filesystem.
 * No production mutation.
 */

"use strict";

const assert = require("assert");

const {
  findParent,
  assertParentType,
  validateHierarchy,
  validateDistrictRouteHierarchy,
  validateRouteHierarchy,
  buildHierarchyReport
} = require("./lgd-location-hierarchy");

const {
  adaptLgdSnapshot
} = require("./lgd-location-adapter");

let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    console.error(error.message);
    process.exitCode = 1;
  }
}

function mustThrow(
  name,
  fn,
  expectedText
) {
  test(name, () => {
    assert.throws(
      fn,
      error => {
        if (
          expectedText &&
          !String(error.message).includes(
            expectedText
          )
        ) {
          return false;
        }

        return true;
      }
    );
  });
}

/* -------------------------------------------------------
 * Valid hierarchy
 * ----------------------------------------------------- */

function validHierarchy() {
  return adaptLgdSnapshot([
    {
      locationType: "STATE",
      sourceCode: "09",
      canonicalName: "Uttar Pradesh"
    },
    {
      locationType: "DISTRICT",
      sourceCode: "0927",
      parentSourceCode: "09",
      stateSlug: "uttar-pradesh",
      canonicalName: "Bareilly"
    },
    {
      locationType: "TEHSIL",
      sourceCode: "T100",
      parentSourceCode: "0927",
      canonicalName: "Faridpur"
    },
    {
      locationType: "LOCAL_BODY",
      sourceCode: "L100",
      parentSourceCode: "0927",
      canonicalName: "Bareilly"
    },
    {
      locationType: "AUTHORITY",
      sourceCode: "A100",
      parentSourceCode: "0927",
      canonicalName: "Development Authority"
    }
  ]);
}

test(
  "Complete normalized hierarchy passes",
  () => {
    const rows =
      validHierarchy();

    const result =
      validateHierarchy(
        rows
      );

    assert.strictEqual(
      result.length,
      5
    );
  }
);

test(
  "Complete route hierarchy passes",
  () => {
    const rows =
      validHierarchy();

    const result =
      validateRouteHierarchy(
        rows
      );

    assert.strictEqual(
      result.length,
      5
    );
  }
);

/* -------------------------------------------------------
 * Parent resolution
 * ----------------------------------------------------- */

test(
  "DISTRICT resolves STATE parent",
  () => {
    const rows =
      validHierarchy();

    const district =
      rows.find(
        row =>
          row.locationType ===
          "DISTRICT"
      );

    const index = {
      normalized: rows
    };

    const parent =
      findParent(
        district,
        index
      );

    assert.strictEqual(
      parent.locationType,
      "STATE"
    );

    assert.strictEqual(
      parent.sourceCode,
      "09"
    );
  }
);

test(
  "TEHSIL resolves DISTRICT parent",
  () => {
    const rows =
      validHierarchy();

    const tehsil =
      rows.find(
        row =>
          row.locationType ===
          "TEHSIL"
      );

    const parent =
      findParent(
        tehsil,
        {
          normalized: rows
        }
      );

    assert.strictEqual(
      parent.locationType,
      "DISTRICT"
    );

    assert.strictEqual(
      parent.sourceCode,
      "0927"
    );
  }
);

/* -------------------------------------------------------
 * Missing parent
 * ----------------------------------------------------- */

mustThrow(
  "Missing DISTRICT parent is rejected",
  () => {
    validateHierarchy([
      {
        sourceSystem: "LGD",
        locationType: "DISTRICT",
        sourceCode: "0927",
        parentSourceCode: "MISSING",
        canonicalName: "Bareilly",
        canonicalSlug: "bareilly",
        currentRoute:
          "/uttar-pradesh/bareilly/"
      }
    ]);
  },
  "Missing parent source identity"
);

/* -------------------------------------------------------
 * Wrong parent type
 * ----------------------------------------------------- */

test(
  "DISTRICT cannot use DISTRICT as parent",
  () => {
    assert.throws(
      () => {
        assertParentType(
          {
            locationType: "DISTRICT",
            sourceCode: "D-INVALID",
            parentSourceCode: "D-PARENT"
          },
          {
            locationType: "DISTRICT",
            sourceCode: "D-PARENT",
            parentSourceCode: "S-01"
          }
        );
      },
      error =>
        String(error.message).includes(
          "Invalid parent type"
        )
    );
  }
);
/* -------------------------------------------------------
 * Root integrity
 * ----------------------------------------------------- */

mustThrow(
  "STATE with parentSourceCode is rejected",
  () => {
    validateHierarchy([
      {
        sourceSystem: "LGD",
        locationType: "STATE",
        sourceCode: "09",
        parentSourceCode: "ROOT",
        canonicalName: "Uttar Pradesh",
        canonicalSlug: "uttar-pradesh",
        currentRoute:
          "/uttar-pradesh/"
      }
    ]);
  },
  "STATE cannot have a parentSourceCode"
);

/* -------------------------------------------------------
 * Direct parent type assertions
 * ----------------------------------------------------- */

test(
  "STATE root assertion passes",
  () => {
    assert.strictEqual(
      assertParentType(
        {
          locationType: "STATE",
          sourceCode: "09",
          parentSourceCode: null
        },
        null
      ),
      true
    );
  }
);

test(
  "DISTRICT with STATE parent passes",
  () => {
    assert.strictEqual(
      assertParentType(
        {
          locationType: "DISTRICT",
          sourceCode: "0927",
          parentSourceCode: "09"
        },
        {
          locationType: "STATE",
          sourceCode: "09"
        }
      ),
      true
    );
  }
);

/* -------------------------------------------------------
 * District route ↔ parent state
 * ----------------------------------------------------- */

test(
  "DISTRICT route matches parent STATE slug",
  () => {
    const rows =
      validHierarchy();

    const state =
      rows.find(
        row =>
          row.locationType ===
          "STATE"
      );

    const district =
      rows.find(
        row =>
          row.locationType ===
          "DISTRICT"
      );

    assert.strictEqual(
      validateDistrictRouteHierarchy(
        district,
        state
      ),
      true
    );
  }
);

mustThrow(
  "DISTRICT route with wrong state slug is rejected",
  () => {
    validateDistrictRouteHierarchy(
      {
        locationType: "DISTRICT",
        sourceCode: "0927",
        canonicalSlug: "bareilly",
        currentRoute:
          "/wrong-state/bareilly/"
      },
      {
        locationType: "STATE",
        sourceCode: "09",
        canonicalSlug:
          "uttar-pradesh"
      }
    );
  },
  "does not match parent STATE"
);

/* -------------------------------------------------------
 * Ambiguous parent identity
 *
 * This is intentionally important.
 * ParentSourceCode is opaque; if the same source code
 * appears under multiple location types, the resolver
 * must fail rather than guess.
 * ----------------------------------------------------- */

test(
  "Same source code across types resolves by typed identity",
  () => {
    const rows = [
      {
        sourceSystem: "LGD",
        locationType: "STATE",
        sourceCode: "09",
        parentSourceCode: null,
        canonicalName: "Uttar Pradesh",
        canonicalSlug:
          "uttar-pradesh",
        currentRoute:
          "/uttar-pradesh/"
      },
      {
        sourceSystem: "LGD",
        locationType: "DISTRICT",
        sourceCode: "09",
        parentSourceCode: null,
        canonicalName: "Example District",
        canonicalSlug:
          "example-district",
        currentRoute:
          "/example/example-district/"
      },
      {
        sourceSystem: "LGD",
        locationType: "TEHSIL",
        sourceCode: "T1",
        parentSourceCode: "09",
        canonicalName: "Example Tehsil",
        canonicalSlug:
          "example-tehsil",
        currentRoute:
          "/tehsil/example-tehsil/"
      }
    ];

    const parent =
      findParent(
        rows[2],
        {
          normalized: rows
        }
      );

    assert.strictEqual(
      parent.locationType,
      "DISTRICT"
    );

    assert.strictEqual(
      parent.sourceCode,
      "09"
    );
  }
);
/* -------------------------------------------------------
 * Multi-state hierarchy
 * ----------------------------------------------------- */

test(
  "Two states with distinct district identities pass",
  () => {
    const rows =
      adaptLgdSnapshot([
        {
          locationType: "STATE",
          sourceCode: "09",
          canonicalName:
            "Uttar Pradesh"
        },
        {
          locationType: "STATE",
          sourceCode: "07",
          canonicalName:
            "Delhi"
        },
        {
          locationType: "DISTRICT",
          sourceCode: "0927",
          parentSourceCode: "09",
          stateSlug:
            "uttar-pradesh",
          canonicalName:
            "Bareilly"
        },
        {
          locationType: "DISTRICT",
          sourceCode: "0701",
          parentSourceCode: "07",
          stateSlug:
            "delhi",
          canonicalName:
            "Bareilly"
        }
      ]);

    const result =
      validateRouteHierarchy(
        rows
      );

    assert.strictEqual(
      result.length,
      4
    );
  }
);

/* -------------------------------------------------------
 * Report
 * ----------------------------------------------------- */

test(
  "Hierarchy report is deterministic",
  () => {
    const rows =
      validHierarchy();

    const first =
      JSON.stringify(
        buildHierarchyReport(
          rows
        )
      );

    const second =
      JSON.stringify(
        buildHierarchyReport(
          rows
        )
      );

    assert.strictEqual(
      first,
      second
    );
  }
);

test(
  "Hierarchy report contains expected counts",
  () => {
    const report =
      buildHierarchyReport(
        validHierarchy()
      );

    assert.strictEqual(
      report.status,
      "PASS"
    );

    assert.strictEqual(
      report.total,
      5
    );

    assert.strictEqual(
      report.counts.STATE,
      1
    );

    assert.strictEqual(
      report.counts.DISTRICT,
      1
    );

    assert.strictEqual(
      report.counts.TEHSIL,
      1
    );

    assert.strictEqual(
      report.counts.LOCAL_BODY,
      1
    );

    assert.strictEqual(
      report.counts.AUTHORITY,
      1
    );
  }
);

/* -------------------------------------------------------
 * Final summary
 * ----------------------------------------------------- */

if (
  process.exitCode === undefined
) {
  console.log(
    `LGD_LOCATION_HIERARCHY_TESTS=PASS (${passed} tests)`
  );
}
