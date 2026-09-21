/**
 * Instant Legal Services
 * LGD Location Registry Fixture Import Verification
 *
 * ACTION 1088.287
 *
 * Purpose:
 * - Verify a deterministic synthetic LGD hierarchy.
 * - Exercise the real LGD importer.
 * - Verify typed identities.
 * - Verify parent identity resolution.
 * - Verify deterministic UPSERT planning.
 * - Verify duplicate protection.
 *
 * SAFETY:
 * - No Supabase.
 * - No PostgreSQL.
 * - No network.
 * - No filesystem writes.
 * - No production mutation.
 * - No real LGD download.
 *
 * IMPORTANT:
 * This is a fixture/import-plan test.
 * It deliberately stops before database persistence.
 */

"use strict";

const assert = require("node:assert/strict");

const importer =
  require("./location-registry-lgd-importer.js");

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
 * DETERMINISTIC SYNTHETIC LGD FIXTURE
 * --------------------------------------------------------------------------
 *
 * Hierarchy:
 *
 * STATE
 *   LGD:STATE:09
 *
 *     └── DISTRICT
 *           LGD:DISTRICT:0927
 *
 *               └── TEHSIL
 *                     LGD:TEHSIL:092701
 *
 * Additional district:
 *
 *   LGD:DISTRICT:0928
 *
 * The fixture is synthetic and is NOT fetched from LGD.
 */

const FIXTURE = [
  {
    lgd_code: "09",
    name: "Fixture State",
    level: "STATE",
    parent_lgd_code: null
  },

  {
    lgd_code: "0927",
    name: "Fixture District A",
    level: "DISTRICT",
    parent_lgd_code: "09"
  },

  {
    lgd_code: "0928",
    name: "Fixture District B",
    level: "DISTRICT",
    parent_lgd_code: "09"
  },

  {
    lgd_code: "092701",
    name: "Fixture Tehsil A",
    level: "TEHSIL",
    parent_lgd_code: "0927"
  }
];

/*
 * --------------------------------------------------------------------------
 * TYPED PARENT IDENTITY MAP
 * --------------------------------------------------------------------------
 */

const PARENT_IDENTITIES =
  new Map([
    [
      "09",
      "LGD:STATE:09"
    ],

    [
      "0927",
      "LGD:DISTRICT:0927"
    ]
  ]);

/*
 * --------------------------------------------------------------------------
 * 1. FIXTURE SIZE
 * --------------------------------------------------------------------------
 */

test(
  "fixture contains expected number of LGD records",
  () => {
    assert.equal(
      FIXTURE.length,
      4
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 2. FIXTURE NORMALIZATION
 * --------------------------------------------------------------------------
 */

test(
  "fixture normalizes successfully",
  () => {
    const normalized =
      importer.normalizeLGDBatch(
        FIXTURE,
        {
          parentIdentityBySourceCode:
            PARENT_IDENTITIES
        }
      );

    assert.equal(
      normalized.length,
      4
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 3. ROOT STATE
 * --------------------------------------------------------------------------
 */

test(
  "fixture contains valid root state",
  () => {
    const state =
      importer.normalizeLGDRecord(
        FIXTURE[0]
      );

    assert.equal(
      state.source_system,
      "LGD"
    );

    assert.equal(
      state.location_type,
      "STATE"
    );

    assert.equal(
      state.source_code,
      "09"
    );

    assert.equal(
      state.parent_source_code,
      null
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 4. DISTRICT PARENT
 * --------------------------------------------------------------------------
 */

test(
  "district resolves to fixture state",
  () => {
    const district =
      importer.normalizeLGDRecord(
        FIXTURE[1]
      );

    assert.equal(
      district.parent_source_code,
      "09"
    );

    assert.equal(
      PARENT_IDENTITIES.get(
        district.parent_source_code
      ),
      "LGD:STATE:09"
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 5. TEHSIL PARENT
 * --------------------------------------------------------------------------
 */

test(
  "tehsil resolves to fixture district",
  () => {
    const tehsil =
      importer.normalizeLGDRecord(
        FIXTURE[3]
      );

    assert.equal(
      tehsil.parent_source_code,
      "0927"
    );

    assert.equal(
      PARENT_IDENTITIES.get(
        tehsil.parent_source_code
      ),
      "LGD:DISTRICT:0927"
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 6. TYPED IDENTITIES
 * --------------------------------------------------------------------------
 */

test(
  "fixture produces four unique typed identities",
  () => {
    const identities =
      FIXTURE.map(
        importer.identityKey
      );

    assert.deepEqual(
      identities,
      [
        "LGD:STATE:09",
        "LGD:DISTRICT:0927",
        "LGD:DISTRICT:0928",
        "LGD:TEHSIL:092701"
      ]
    );

    assert.equal(
      new Set(identities).size,
      4
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 7. SAME CODE / DIFFERENT TYPE
 * --------------------------------------------------------------------------
 *
 * Explicitly verify the previously discovered edge case.
 */

test(
  "same source code can exist under different location types",
  () => {
    const records = [
      {
        lgd_code: "09",
        name: "Fixture State",
        level: "STATE",
        parent_lgd_code: null
      },

      {
        lgd_code: "09",
        name: "Fixture District With Same Code",
        level: "DISTRICT",
        parent_lgd_code: null
      }
    ];

    const normalized =
      importer.normalizeLGDBatch(
        records
      );

    const identities =
      normalized.map(
        importer.identityKey
      );

    assert.deepEqual(
      identities,
      [
        "LGD:STATE:09",
        "LGD:DISTRICT:09"
      ]
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 8. IMPORT PLAN
 * --------------------------------------------------------------------------
 */

test(
  "fixture produces deterministic UPSERT import plan",
  () => {
    const plan =
      importer.buildImportPlan(
        FIXTURE,
        {
          parentIdentityBySourceCode:
            PARENT_IDENTITIES
        }
      );

    assert.equal(
      plan.source_system,
      "LGD"
    );

    assert.equal(
      plan.count,
      4
    );

    assert.equal(
      plan.operations.length,
      4
    );

    for (
      const operation
      of plan.operations
    ) {
      assert.equal(
        operation.operation,
        "UPSERT"
      );
    }
  }
);

/*
 * --------------------------------------------------------------------------
 * 9. EXPECTED IDENTITIES IN IMPORT PLAN
 * --------------------------------------------------------------------------
 */

test(
  "import plan contains all expected identities",
  () => {
    const plan =
      importer.buildImportPlan(
        FIXTURE,
        {
          parentIdentityBySourceCode:
            PARENT_IDENTITIES
        }
      );

    const identities =
      plan.operations.map(
        operation =>
          operation.identity
      );

    assert.deepEqual(
      identities,
      [
        "LGD:DISTRICT:0927",
        "LGD:DISTRICT:0928",
        "LGD:STATE:09",
        "LGD:TEHSIL:092701"
      ]
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 10. PARENT VALUES PRESERVED
 * --------------------------------------------------------------------------
 */

test(
  "import plan preserves parent source codes",
  () => {
    const plan =
      importer.buildImportPlan(
        FIXTURE,
        {
          parentIdentityBySourceCode:
            PARENT_IDENTITIES
        }
      );

    const district =
      plan.operations.find(
        operation =>
          operation.identity ===
          "LGD:DISTRICT:0927"
      );

    const tehsil =
      plan.operations.find(
        operation =>
          operation.identity ===
          "LGD:TEHSIL:092701"
      );

    assert.equal(
      district.row.parent_source_code,
      "09"
    );

    assert.equal(
      tehsil.row.parent_source_code,
      "0927"
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 11. DUPLICATE FIXTURE PROTECTION
 * --------------------------------------------------------------------------
 */

expectThrow(
  "duplicate fixture identity is rejected",
  () => {
    importer.buildImportPlan(
      [
        ...FIXTURE,

        {
          ...FIXTURE[1],
          name: "Duplicate District"
        }
      ],
      {
        parentIdentityBySourceCode:
          PARENT_IDENTITIES
      }
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 12. UNRESOLVED PARENT PROTECTION
 * --------------------------------------------------------------------------
 */

expectThrow(
  "unresolved parent identity is rejected",
  () => {
    importer.buildImportPlan(
      [
        {
          lgd_code: "999901",
          name: "Broken Fixture Tehsil",
          level: "TEHSIL",
          parent_lgd_code: "9999"
        }
      ],
      {
        parentIdentityBySourceCode:
          PARENT_IDENTITIES
      }
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 13. TYPED SELF-PARENT PROTECTION
 * --------------------------------------------------------------------------
 */

expectThrow(
  "same typed identity cannot be its own parent",
  () => {
    importer.buildImportPlan(
      [
        {
          lgd_code: "0927",
          name: "Invalid Self Parent",
          level: "DISTRICT",
          parent_lgd_code: "0927"
        }
      ],
      {
        parentIdentityBySourceCode:
          new Map([
            [
              "0927",
              "LGD:DISTRICT:0927"
            ]
          ])
      }
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 14. PLAN DETERMINISM
 * --------------------------------------------------------------------------
 */

test(
  "same fixture produces identical plan twice",
  () => {
    const first =
      importer.buildImportPlan(
        FIXTURE,
        {
          parentIdentityBySourceCode:
            PARENT_IDENTITIES
        }
      );

    const second =
      importer.buildImportPlan(
        FIXTURE,
        {
          parentIdentityBySourceCode:
            PARENT_IDENTITIES
        }
      );

    assert.deepEqual(
      first,
      second
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 15. INPUT IMMUTABILITY
 * --------------------------------------------------------------------------
 */

test(
  "fixture input is not mutated",
  () => {
    const before =
      JSON.stringify(
        FIXTURE
      );

    importer.buildImportPlan(
      FIXTURE,
      {
        parentIdentityBySourceCode:
          PARENT_IDENTITIES
      }
    );

    const after =
      JSON.stringify(
        FIXTURE
      );

    assert.equal(
      after,
      before
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 16. DATABASE BOUNDARY
 * --------------------------------------------------------------------------
 *
 * executeImportPlan requires an explicit adapter.
 * We deliberately do NOT supply one.
 */

test(
  "fixture test does not execute database persistence",
  async () => {
    const plan =
      importer.buildImportPlan(
        FIXTURE,
        {
          parentIdentityBySourceCode:
            PARENT_IDENTITIES
        }
      );

    await assert.rejects(
      () =>
        importer.executeImportPlan(
          plan
        )
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * FINAL RESULT
 * --------------------------------------------------------------------------
 */

console.log("");

console.log(
  "=============================================="
);

console.log(
  "LGD FIXTURE IMPORT VERIFICATION"
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
    "LGD_FIXTURE_IMPORT_TEST=FAIL"
  );

  process.exitCode = 1;
} else {
  console.log(
    "LGD_FIXTURE_IMPORT_TEST=PASS"
  );

  console.log(
    "DATABASE_MODIFIED=NO"
  );

  console.log(
    "PRODUCTION_MODIFIED=NO"
  );
}
