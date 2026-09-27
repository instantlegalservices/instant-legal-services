/**
 * Instant Legal Services
 * Adversarial tests for LGD Location Ingestion Contract
 */

"use strict";

const assert = require("assert");

const {
  validateNormalizedLgdRows,
  buildDryRunReport
} = require("./lgd-location-ingestion");

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
    console.error(error.message);
  }
}

function expectThrow(name, fn) {
  test(name, () => {
    assert.throws(fn);
  });
}

function row(overrides = {}) {
  return {
    sourceSystem: "LGD",
    locationType: "DISTRICT",
    sourceCode: "12345",
    parentSourceCode: "9",
    canonicalName: "Bareilly",
    canonicalSlug: "bareilly",
    currentRoute: "/uttar-pradesh/bareilly/",
    ...overrides
  };
}

test(
  "valid normalized LGD row passes",
  () => {
    const result =
      validateNormalizedLgdRows([
        row()
      ]);

    assert.strictEqual(
      result.length,
      1
    );

    assert.strictEqual(
      result[0].sourceCode,
      "12345"
    );
  }
);

test(
  "empty input is valid dry-run input",
  () => {
    const result =
      buildDryRunReport([]);

    assert.strictEqual(
      result.status,
      "PASS"
    );

    assert.strictEqual(
      result.total,
      0
    );
  }
);

test(
  "duplicate source identity fails",
  () => {
    expectThrow(
      "duplicate source identity",
      () =>
        validateNormalizedLgdRows([
          row(),
          row()
        ])
    );
  }
);

test(
  "duplicate current route fails",
  () => {
    expectThrow(
      "duplicate current route",
      () =>
        validateNormalizedLgdRows([
          row(),
          row({
            sourceCode: "12346",
            canonicalName: "Pilibhit",
            canonicalSlug: "pilibhit"
          })
        ])
    );
  }
);

test(
  "STATE route shape is enforced",
  () => {
    expectThrow(
      "state route depth",
      () =>
        validateNormalizedLgdRows([
          row({
            locationType: "STATE",
            sourceCode: "9",
            parentSourceCode: null,
            canonicalName: "Uttar Pradesh",
            canonicalSlug: "uttar-pradesh",
            currentRoute:
              "/uttar-pradesh/district/"
          })
        ])
    );
  }
);

test(
  "STATE route accepts one-level route",
  () => {
    const result =
      validateNormalizedLgdRows([
        row({
          locationType: "STATE",
          sourceCode: "9",
          parentSourceCode: null,
          canonicalName: "Uttar Pradesh",
          canonicalSlug: "uttar-pradesh",
          currentRoute:
            "/uttar-pradesh/"
        })
      ]);

    assert.strictEqual(
      result[0].currentRoute,
      "/uttar-pradesh/"
    );
  }
);

test(
  "DISTRICT route requires state and district",
  () => {
    const result =
      validateNormalizedLgdRows([
        row()
      ]);

    assert.strictEqual(
      result[0].currentRoute,
      "/uttar-pradesh/bareilly/"
    );
  }
);

test(
  "DISTRICT flat route is rejected",
  () => {
    expectThrow(
      "district flat route",
      () =>
        validateNormalizedLgdRows([
          row({
            currentRoute:
              "/bareilly/"
          })
        ])
    );
  }
);

test(
  "DISTRICT typed tehsil namespace is rejected",
  () => {
    expectThrow(
      "district tehsil namespace",
      () =>
        validateNormalizedLgdRows([
          row({
            currentRoute:
              "/tehsil/bareilly/"
          })
        ])
    );
  }
);

test(
  "TEHSIL route namespace is enforced",
  () => {
    expectThrow(
      "tehsil namespace",
      () =>
        validateNormalizedLgdRows([
          row({
            locationType: "TEHSIL",
            sourceCode: "77",
            canonicalName: "Bareilly",
            canonicalSlug: "bareilly",
            currentRoute:
              "/uttar-pradesh/bareilly/"
          })
        ])
    );
  }
);

test(
  "valid TEHSIL route passes",
  () => {
    const result =
      validateNormalizedLgdRows([
        row({
          locationType: "TEHSIL",
          sourceCode: "77",
          canonicalName: "Bareilly",
          canonicalSlug: "bareilly",
          currentRoute:
            "/tehsil/bareilly/"
        })
      ]);

    assert.strictEqual(
      result[0].locationType,
      "TEHSIL"
    );
  }
);

test(
  "LOCAL_BODY route namespace is enforced",
  () => {
    expectThrow(
      "local body namespace",
      () =>
        validateNormalizedLgdRows([
          row({
            locationType:
              "LOCAL_BODY",
            sourceCode: "88",
            canonicalName:
              "Bareilly Nagar Nigam",
            canonicalSlug:
              "bareilly-nagar-nigam",
            currentRoute:
              "/bareilly-nagar-nigam/"
          })
        ])
    );
  }
);

test(
  "valid LOCAL_BODY route passes",
  () => {
    const result =
      validateNormalizedLgdRows([
        row({
          locationType:
            "LOCAL_BODY",
          sourceCode: "88",
          canonicalName:
            "Bareilly Nagar Nigam",
          canonicalSlug:
            "bareilly-nagar-nigam",
          currentRoute:
            "/local-body/bareilly-nagar-nigam/"
        })
      ]);

    assert.strictEqual(
      result[0].locationType,
      "LOCAL_BODY"
    );
  }
);

test(
  "AUTHORITY route namespace is enforced",
  () => {
    expectThrow(
      "authority namespace",
      () =>
        validateNormalizedLgdRows([
          row({
            locationType:
              "AUTHORITY",
            sourceCode: "99",
            canonicalName:
              "Example Authority",
            canonicalSlug:
              "example-authority",
            currentRoute:
              "/example-authority/"
          })
        ])
    );
  }
);

test(
  "valid AUTHORITY route passes",
  () => {
    const result =
      validateNormalizedLgdRows([
        row({
          locationType:
            "AUTHORITY",
          sourceCode: "99",
          canonicalName:
            "Example Authority",
          canonicalSlug:
            "example-authority",
          currentRoute:
            "/authority/example-authority/"
        })
      ]);

    assert.strictEqual(
      result[0].locationType,
      "AUTHORITY"
    );
  }
);

test(
  "query string is rejected",
  () => {
    expectThrow(
      "query string",
      () =>
        validateNormalizedLgdRows([
          row({
            currentRoute:
              "/uttar-pradesh/bareilly/?x=1"
          })
        ])
    );
  }
);

test(
  "fragment is rejected",
  () => {
    expectThrow(
      "fragment",
      () =>
        validateNormalizedLgdRows([
          row({
            currentRoute:
              "/uttar-pradesh/bareilly/#x"
          })
        ])
    );
  }
);

test(
  "duplicate slashes are rejected",
  () => {
    expectThrow(
      "duplicate slashes",
      () =>
        validateNormalizedLgdRows([
          row({
            currentRoute:
              "/uttar-pradesh//bareilly/"
          })
        ])
    );
  }
);

test(
  "backslash is rejected",
  () => {
    expectThrow(
      "backslash",
      () =>
        validateNormalizedLgdRows([
          row({
            currentRoute:
              "/uttar-pradesh\\bareilly/"
          })
        ])
    );
  }
);

test(
  "uppercase slug is rejected",
  () => {
    expectThrow(
      "uppercase slug",
      () =>
        validateNormalizedLgdRows([
          row({
            canonicalSlug:
              "Bareilly"
          })
        ])
    );
  }
);

test(
  "uppercase route segment is rejected",
  () => {
    expectThrow(
      "uppercase route",
      () =>
        validateNormalizedLgdRows([
          row({
            currentRoute:
              "/Uttar-Pradesh/bareilly/"
          })
        ])
    );
  }
);

test(
  "underscore slug is rejected",
  () => {
    expectThrow(
      "underscore slug",
      () =>
        validateNormalizedLgdRows([
          row({
            canonicalSlug:
              "bareilly_city"
          })
        ])
    );
  }
);

test(
  "whitespace in source code is rejected",
  () => {
    expectThrow(
      "source code whitespace",
      () =>
        validateNormalizedLgdRows([
          row({
            sourceCode:
              "12 345"
          })
        ])
    );
  }
);

test(
  "missing source code is rejected",
  () => {
    expectThrow(
      "missing source code",
      () =>
        validateNormalizedLgdRows([
          row({
            sourceCode: ""
          })
        ])
    );
  }
);

test(
  "unsupported type is rejected",
  () => {
    expectThrow(
      "unsupported type",
      () =>
        validateNormalizedLgdRows([
          row({
            locationType:
              "VILLAGE"
          })
        ])
    );
  }
);

test(
  "non-LGD source is rejected",
  () => {
    expectThrow(
      "wrong source system",
      () =>
        validateNormalizedLgdRows([
          row({
            sourceSystem:
              "ADVOCATE_API"
          })
        ])
    );
  }
);

test(
  "typed namespaces can share the same slug safely",
  () => {
    const result =
      validateNormalizedLgdRows([
        row({
          locationType:
            "TEHSIL",
          sourceCode: "200",
          canonicalName:
            "Bareilly",
          canonicalSlug:
            "bareilly",
          currentRoute:
            "/tehsil/bareilly/"
        }),
        row({
          locationType:
            "LOCAL_BODY",
          sourceCode: "201",
          canonicalName:
            "Bareilly",
          canonicalSlug:
            "bareilly",
          currentRoute:
            "/local-body/bareilly/"
        })
      ]);

    assert.strictEqual(
      result.length,
      2
    );
  }
);

test(
  "duplicate STATE slug is rejected",
  () => {
    expectThrow(
      "duplicate state slug",
      () =>
        validateNormalizedLgdRows([
          row({
            locationType:
              "STATE",
            sourceCode: "9",
            parentSourceCode: null,
            canonicalName:
              "Uttar Pradesh",
            canonicalSlug:
              "uttar-pradesh",
            currentRoute:
              "/uttar-pradesh/"
          }),
          row({
            locationType:
              "STATE",
            sourceCode: "10",
            parentSourceCode: null,
            canonicalName:
              "Uttar Pradesh",
            canonicalSlug:
              "uttar-pradesh",
            currentRoute:
              "/uttar-pradesh/"
          })
        ])
    );
  }
);

test(
  "dry-run report is deterministic for valid rows",
  () => {
    const result =
      buildDryRunReport([
        row({
          locationType:
            "STATE",
          sourceCode: "9",
          parentSourceCode:
            null,
          canonicalName:
            "Uttar Pradesh",
          canonicalSlug:
            "uttar-pradesh",
          currentRoute:
            "/uttar-pradesh/"
        }),
        row()
      ]);

    assert.strictEqual(
      result.status,
      "PASS"
    );

    assert.strictEqual(
      result.sourceSystem,
      "LGD"
    );

    assert.strictEqual(
      result.total,
      2
    );

    assert.strictEqual(
      result.byType.STATE,
      1
    );

    assert.strictEqual(
      result.byType.DISTRICT,
      1
    );

    assert.deepStrictEqual(
      result.routes,
      [
        "/uttar-pradesh/",
        "/uttar-pradesh/bareilly/"
      ]
    );
  }
);

console.log("");
console.log(
  "=============================================="
);
console.log(
  "LGD LOCATION INGESTION TEST RESULT"
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

if (
  failed > 0
) {
  console.error(
    "LGD_LOCATION_INGESTION_TEST=FAIL"
  );

  process.exitCode = 1;
} else {
  console.log(
    "LGD_LOCATION_INGESTION_TEST=PASS"
  );
}
