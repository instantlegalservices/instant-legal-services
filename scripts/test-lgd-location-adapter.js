/**
 * Instant Legal Services
 * LGD Location Adapter - Adversarial Test Suite
 *
 * Purpose:
 * - Verify LGD -> ILS normalization.
 * - Verify deterministic route generation.
 * - Verify identity preservation.
 * - Verify fail-closed behavior.
 * - No network.
 * - No database.
 * - No filesystem writes.
 * - No production mutation.
 */

"use strict";

const assert = require("assert");

const {
  slugifyLatinName,
  resolveSlug,
  buildRoute,
  adaptLgdRow,
  adaptLgdSnapshot
} = require("./lgd-location-adapter");

const {
  buildDryRunReport
} = require("./lgd-location-ingestion");

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

function mustThrow(name, fn, expectedText) {
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
 * slug generation
 * ----------------------------------------------------- */

test(
  "Latin name generates deterministic slug",
  () => {
    assert.strictEqual(
      slugifyLatinName("Bareilly"),
      "bareilly"
    );
  }
);

test(
  "Name with spaces generates canonical hyphen slug",
  () => {
    assert.strictEqual(
      slugifyLatinName(
        "Uttar Pradesh"
      ),
      "uttar-pradesh"
    );
  }
);

test(
  "Ampersand is normalized safely",
  () => {
    assert.strictEqual(
      slugifyLatinName(
        "R & R Nagar"
      ),
      "r-and-r-nagar"
    );
  }
);

mustThrow(
  "Unicode name requires reviewed explicit slug",
  () => {
    slugifyLatinName("बरेली");
  },
  "explicit reviewed canonicalSlug"
);

mustThrow(
  "Empty name cannot generate slug",
  () => {
    slugifyLatinName("");
  },
  "canonicalName"
);

/* -------------------------------------------------------
 * explicit slug resolution
 * ----------------------------------------------------- */

test(
  "Explicit canonicalSlug is preserved",
  () => {
    assert.strictEqual(
      resolveSlug({
        canonicalName: "Bareilly",
        canonicalSlug: "custom-bareilly"
      }),
      "custom-bareilly"
    );
  }
);

mustThrow(
  "Uppercase explicit slug is rejected",
  () => {
    resolveSlug({
      canonicalName: "Bareilly",
      canonicalSlug: "Bareilly"
    });
  },
  "canonicalSlug"
);

mustThrow(
  "Underscore explicit slug is rejected",
  () => {
    resolveSlug({
      canonicalName: "Bareilly",
      canonicalSlug: "bareilly_city"
    });
  },
  "canonicalSlug"
);

/* -------------------------------------------------------
 * route generation
 * ----------------------------------------------------- */

test(
  "STATE route generation",
  () => {
    assert.strictEqual(
      buildRoute({
        locationType: "STATE",
        canonicalSlug: "uttar-pradesh"
      }),
      "/uttar-pradesh/"
    );
  }
);

test(
  "DISTRICT route generation",
  () => {
    assert.strictEqual(
      buildRoute({
        locationType: "DISTRICT",
        stateSlug: "uttar-pradesh",
        canonicalSlug: "bareilly"
      }),
      "/uttar-pradesh/bareilly/"
    );
  }
);

test(
  "TEHSIL route generation",
  () => {
    assert.strictEqual(
      buildRoute({
        locationType: "TEHSIL",
        canonicalSlug: "faridpur"
      }),
      "/tehsil/faridpur/"
    );
  }
);

test(
  "LOCAL_BODY route generation",
  () => {
    assert.strictEqual(
      buildRoute({
        locationType: "LOCAL_BODY",
        canonicalSlug: "bareilly"
      }),
      "/local-body/bareilly/"
    );
  }
);

test(
  "AUTHORITY route generation",
  () => {
    assert.strictEqual(
      buildRoute({
        locationType: "AUTHORITY",
        canonicalSlug: "development-authority"
      }),
      "/authority/development-authority/"
    );
  }
);

mustThrow(
  "DISTRICT without stateSlug is rejected",
  () => {
    buildRoute({
      locationType: "DISTRICT",
      canonicalSlug: "bareilly"
    });
  },
  "stateSlug"
);

mustThrow(
  "Unsupported COURT route is rejected",
  () => {
    buildRoute({
      locationType: "COURT",
      canonicalSlug: "district-court"
    });
  },
  "Unsupported"
);

/* -------------------------------------------------------
 * single-row adapter
 * ----------------------------------------------------- */

test(
  "Valid STATE row is adapted",
  () => {
    const row = adaptLgdRow({
      locationType: "STATE",
      sourceCode: "09",
      canonicalName: "Uttar Pradesh"
    });

    assert.deepStrictEqual(
      row,
      {
        sourceSystem: "LGD",
        locationType: "STATE",
        sourceCode: "09",
        parentSourceCode: null,
        canonicalName: "Uttar Pradesh",
        canonicalSlug: "uttar-pradesh",
        currentRoute: "/uttar-pradesh/"
      }
    );
  }
);

test(
  "Valid DISTRICT row preserves parent source identity",
  () => {
    const row = adaptLgdRow({
      locationType: "DISTRICT",
      sourceCode: "0927",
      parentSourceCode: "09",
      stateSlug: "uttar-pradesh",
      canonicalName: "Bareilly"
    });

    assert.deepStrictEqual(
      row,
      {
        sourceSystem: "LGD",
        locationType: "DISTRICT",
        sourceCode: "0927",
        parentSourceCode: "09",
        canonicalName: "Bareilly",
        canonicalSlug: "bareilly",
        currentRoute:
          "/uttar-pradesh/bareilly/"
      }
    );
  }
);

test(
  "Explicit reviewed slug is retained",
  () => {
    const row = adaptLgdRow({
      locationType: "TEHSIL",
      sourceCode: "T100",
      canonicalName: "Example Name",
      canonicalSlug: "reviewed-example"
    });

    assert.strictEqual(
      row.canonicalSlug,
      "reviewed-example"
    );

    assert.strictEqual(
      row.currentRoute,
      "/tehsil/reviewed-example/"
    );
  }
);

/* -------------------------------------------------------
 * malformed source data
 * ----------------------------------------------------- */

mustThrow(
  "Missing sourceCode is rejected",
  () => {
    adaptLgdRow({
      locationType: "STATE",
      canonicalName: "Uttar Pradesh"
    });
  },
  "sourceCode"
);

mustThrow(
  "Whitespace sourceCode is rejected",
  () => {
    adaptLgdRow({
      locationType: "STATE",
      sourceCode: "09 10",
      canonicalName: "Uttar Pradesh"
    });
  },
  "whitespace"
);

mustThrow(
  "Whitespace around sourceCode is rejected",
  () => {
    adaptLgdRow({
      locationType: "STATE",
      sourceCode: " 09 ",
      canonicalName: "Uttar Pradesh"
    });
  },
  "whitespace"
);

mustThrow(
  "Unsupported location type is rejected",
  () => {
    adaptLgdRow({
      locationType: "VILLAGE",
      sourceCode: "V1",
      canonicalName: "Example"
    });
  },
  "Unsupported"
);

mustThrow(
  "Array is not accepted as source row",
  () => {
    adaptLgdRow([]);
  },
  "object"
);

/* -------------------------------------------------------
 * snapshot identity and collision tests
 * ----------------------------------------------------- */

test(
  "Valid multi-row snapshot passes",
  () => {
    const result =
      adaptLgdSnapshot([
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
          sourceCode: "T1",
          parentSourceCode: "0927",
          canonicalName: "Faridpur"
        }
      ]);

    assert.strictEqual(
      result.length,
      3
    );
  }
);

mustThrow(
  "Duplicate source identity is rejected",
  () => {
    adaptLgdSnapshot([
      {
        locationType: "STATE",
        sourceCode: "09",
        canonicalName: "Uttar Pradesh"
      },
      {
        locationType: "STATE",
        sourceCode: "09",
        canonicalName: "UP Duplicate"
      }
    ]);
  },
  "Duplicate LGD source identity"
);

mustThrow(
  "Duplicate generated route is rejected",
  () => {
    adaptLgdSnapshot([
      {
        locationType: "TEHSIL",
        sourceCode: "T1",
        canonicalName: "Faridpur"
      },
      {
        locationType: "TEHSIL",
        sourceCode: "T2",
        canonicalName: "Faridpur"
      }
    ]);
  },
  "Duplicate current route"
);

mustThrow(
  "Duplicate STATE slug is rejected",
  () => {
    adaptLgdSnapshot([
      {
        locationType: "STATE",
        sourceCode: "01",
        canonicalName: "Example State"
      },
      {
        locationType: "STATE",
        sourceCode: "02",
        canonicalName: "Example State"
      }
    ]);
  },
  "Duplicate current route"
);

/* -------------------------------------------------------
 * namespace collision
 * ----------------------------------------------------- */

test(
  "Different typed namespaces may use same slug",
  () => {
    const result =
      adaptLgdSnapshot([
        {
          locationType: "TEHSIL",
          sourceCode: "T1",
          canonicalName: "Bareilly"
        },
        {
          locationType: "LOCAL_BODY",
          sourceCode: "L1",
          canonicalName: "Bareilly"
        },
        {
          locationType: "AUTHORITY",
          sourceCode: "A1",
          canonicalName: "Bareilly"
        }
      ]);

    assert.deepStrictEqual(
      result.map(
        row => row.currentRoute
      ),
      [
        "/tehsil/bareilly/",
        "/local-body/bareilly/",
        "/authority/bareilly/"
      ]
    );
  }
);

/* -------------------------------------------------------
 * deterministic behavior
 * ----------------------------------------------------- */

test(
  "Same input produces identical output",
  () => {
    const input = [
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
      }
    ];

    const first =
      JSON.stringify(
        adaptLgdSnapshot(input)
      );

    const second =
      JSON.stringify(
        adaptLgdSnapshot(input)
      );

    assert.strictEqual(
      first,
      second
    );
  }
);

/* -------------------------------------------------------
 * dry-run report compatibility
 * ----------------------------------------------------- */

test(
  "Normalized adapter output works with LGD dry-run report",
  () => {
    const normalized =
      adaptLgdSnapshot([
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
        }
      ]);

    const report =
      buildDryRunReport(
        normalized
      );

    assert.strictEqual(
      report.status,
      "PASS"
    );

    assert.strictEqual(
      report.sourceSystem,
      "LGD"
    );

    assert.strictEqual(
      report.total,
      2
    );

    assert.strictEqual(
      report.byType.STATE,
      1
    );

    assert.strictEqual(
      report.byType.DISTRICT,
      1
    );
  }
);

/* -------------------------------------------------------
 * summary
 * ----------------------------------------------------- */

if (
  process.exitCode === undefined
) {
  console.log(
    `LGD_LOCATION_ADAPTER_TESTS=PASS (${passed} tests)`
  );
}
