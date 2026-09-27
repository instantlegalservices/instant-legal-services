/**
 * Instant Legal Services
 * LGD Location Registry Importer Verification
 *
 * ACTION 1088.286
 *
 * Purpose:
 * - Verify ACTION 1088.285 importer core.
 * - Test normalization.
 * - Test typed identity.
 * - Test duplicate protection.
 * - Test parent handling.
 * - Test deterministic import planning.
 * - Verify explicit persistence-adapter boundary.
 *
 * SAFETY:
 * - No Supabase.
 * - No PostgreSQL.
 * - No network.
 * - No filesystem writes.
 * - No production mutation.
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

async function asyncTest(name, fn) {
  try {
    await fn();

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
 * FIXTURES
 * --------------------------------------------------------------------------
 */

function stateRecord() {
  return {
    lgd_code: "09",
    name: "Uttar Pradesh",
    level: "STATE",
    parent_lgd_code: null
  };
}

function districtRecord() {
  return {
    lgd_code: "0927",
    name: "Bareilly",
    level: "DISTRICT",
    parent_lgd_code: "09"
  };
}

function secondDistrictRecord() {
  return {
    lgd_code: "0928",
    name: "Moradabad",
    level: "DISTRICT",
    parent_lgd_code: "09"
  };
}

/*
 * --------------------------------------------------------------------------
 * 1. MODULE LOAD
 * --------------------------------------------------------------------------
 */

test(
  "importer module loads successfully",
  () => {
    assert.equal(
      typeof importer.normalizeLGDRecord,
      "function"
    );

    assert.equal(
      typeof importer.identityKey,
      "function"
    );

    assert.equal(
      typeof importer.normalizeLGDBatch,
      "function"
    );

    assert.equal(
      typeof importer.buildImportPlan,
      "function"
    );

    assert.equal(
      typeof importer.executeImportPlan,
      "function"
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 2. SOURCE SYSTEM
 * --------------------------------------------------------------------------
 */

test(
  "LGD source system is fixed to LGD",
  () => {
    assert.equal(
      importer.SOURCE_SYSTEM,
      "LGD"
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 3. VALID STATE NORMALIZATION
 * --------------------------------------------------------------------------
 */

test(
  "valid LGD state normalizes correctly",
  () => {
    const result =
      importer.normalizeLGDRecord(
        stateRecord()
      );

    assert.deepEqual(
      result,
      {
        source_system: "LGD",
        source_code: "09",
        location_type: "STATE",
        canonical_name: "Uttar Pradesh",
        parent_source_code: null
      }
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 4. VALID DISTRICT NORMALIZATION
 * --------------------------------------------------------------------------
 */

test(
  "valid LGD district normalizes correctly",
  () => {
    const result =
      importer.normalizeLGDRecord(
        districtRecord()
      );

    assert.deepEqual(
      result,
      {
        source_system: "LGD",
        source_code: "0927",
        location_type: "DISTRICT",
        canonical_name: "Bareilly",
        parent_source_code: "09"
      }
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 5. DATABASE FIELD ALIASES
 * --------------------------------------------------------------------------
 */

test(
  "schema field names are accepted",
  () => {
    const result =
      importer.normalizeLGDRecord({
        source_system: "LGD",
        source_code: "09",
        canonical_name: "Uttar Pradesh",
        location_type: "STATE",
        parent_source_code: null
      });

    assert.equal(
      result.source_code,
      "09"
    );

    assert.equal(
      result.canonical_name,
      "Uttar Pradesh"
    );

    assert.equal(
      result.location_type,
      "STATE"
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 6. NON-LGD SOURCE REJECTED
 * --------------------------------------------------------------------------
 */

expectThrow(
  "non-LGD source is rejected",
  () => {
    importer.normalizeLGDRecord({
      ...stateRecord(),
      source_system: "OTHER"
    });
  }
);

/*
 * --------------------------------------------------------------------------
 * 7. MISSING CODE REJECTED
 * --------------------------------------------------------------------------
 */

expectThrow(
  "missing LGD code is rejected",
  () => {
    const record = {
      ...stateRecord()
    };

    delete record.lgd_code;

    importer.normalizeLGDRecord(
      record
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 8. BLANK CODE REJECTED
 * --------------------------------------------------------------------------
 */

expectThrow(
  "blank LGD code is rejected",
  () => {
    importer.normalizeLGDRecord({
      ...stateRecord(),
      lgd_code: "   "
    });
  }
);

/*
 * --------------------------------------------------------------------------
 * 9. MISSING NAME REJECTED
 * --------------------------------------------------------------------------
 */

expectThrow(
  "missing location name is rejected",
  () => {
    const record = {
      ...stateRecord()
    };

    delete record.name;

    importer.normalizeLGDRecord(
      record
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 10. MISSING LEVEL REJECTED
 * --------------------------------------------------------------------------
 */

expectThrow(
  "missing location level is rejected",
  () => {
    const record = {
      ...stateRecord()
    };

    delete record.level;

    importer.normalizeLGDRecord(
      record
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 11. UNSUPPORTED LEVEL REJECTED
 * --------------------------------------------------------------------------
 */

expectThrow(
  "unsupported location type is rejected",
  () => {
    importer.normalizeLGDRecord({
      ...stateRecord(),
      level: "UNKNOWN"
    });
  }
);

/*
 * --------------------------------------------------------------------------
 * 12. PARENT MAY BE NULL
 * --------------------------------------------------------------------------
 */

test(
  "root LGD record may have null parent",
  () => {
    const result =
      importer.normalizeLGDRecord(
        stateRecord()
      );

    assert.equal(
      result.parent_source_code,
      null
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 13. CHILD PARENT IS PRESERVED
 * --------------------------------------------------------------------------
 */

test(
  "child parent source code is preserved",
  () => {
    const result =
      importer.normalizeLGDRecord(
        districtRecord()
      );

    assert.equal(
      result.parent_source_code,
      "09"
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 14. TYPED IDENTITY
 * --------------------------------------------------------------------------
 */

test(
  "typed identity matches database contract",
  () => {
    const key =
      importer.identityKey(
        districtRecord()
      );

    assert.equal(
      key,
      "LGD:DISTRICT:0927"
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 15. SAME CODE DIFFERENT TYPE
 * --------------------------------------------------------------------------
 *
 * Must be allowed because location_type participates
 * in the unique identity.
 */

test(
  "same code with different location types is allowed",
  () => {
    const records = [
      stateRecord(),
      {
        ...districtRecord(),
        lgd_code: "09"
      }
    ];

    const result =
      importer.normalizeLGDBatch(
        records
      );

    assert.equal(
      result.length,
      2
    );

    assert.notEqual(
      importer.identityKey(
        result[0]
      ),
      importer.identityKey(
        result[1]
      )
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 16. SAME CODE SAME TYPE
 * --------------------------------------------------------------------------
 */

expectThrow(
  "same typed identity is rejected",
  () => {
    importer.normalizeLGDBatch([
      districtRecord(),
      {
        ...districtRecord(),
        name: "Duplicate Bareilly"
      }
    ]);
  }
);

/*
 * --------------------------------------------------------------------------
 * 17. DUPLICATE INPUT PROTECTION
 * --------------------------------------------------------------------------
 */

expectThrow(
  "duplicate LGD records are rejected",
  () => {
    importer.normalizeLGDBatch([
      stateRecord(),
      stateRecord()
    ]);
  }
);

/*
 * --------------------------------------------------------------------------
 * 18. SELF PARENT PROTECTION
 * --------------------------------------------------------------------------
 */

/*
 * --------------------------------------------------------------------------
 * 18. TYPED SELF-PARENT PROTECTION
 * --------------------------------------------------------------------------
 *
 * Raw source_code equality is NOT sufficient to identify a self-parent.
 *
 * Parent identity must be fully typed:
 *
 *   source_system + location_type + source_code
 */

expectThrow(
  "same typed identity is rejected as parent",
  () => {
    importer.normalizeLGDBatch(
      [
        {
          ...districtRecord(),
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
 * 19. DETERMINISTIC NORMALIZATION
 * --------------------------------------------------------------------------
 */

test(
  "normalization is deterministic",
  () => {
    const first =
      importer.normalizeLGDRecord(
        districtRecord()
      );

    const second =
      importer.normalizeLGDRecord(
        districtRecord()
      );

    assert.deepEqual(
      first,
      second
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 20. IMPORT PLAN
 * --------------------------------------------------------------------------
 */

test(
  "import plan contains UPSERT operations",
  () => {
    const plan =
      importer.buildImportPlan([
        districtRecord()
      ]);

    assert.equal(
      plan.source_system,
      "LGD"
    );

    assert.equal(
      plan.count,
      1
    );

    assert.equal(
      plan.operations.length,
      1
    );

    assert.equal(
      plan.operations[0].operation,
      "UPSERT"
    );

    assert.equal(
      plan.operations[0].identity,
      "LGD:DISTRICT:0927"
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 21. IMPORT PLAN IS DETERMINISTIC
 * --------------------------------------------------------------------------
 */

test(
  "import plan ordering is deterministic",
  () => {
    const records = [
      secondDistrictRecord(),
      districtRecord(),
      stateRecord()
    ];

    const first =
      importer.buildImportPlan(
        records
      );

    const second =
      importer.buildImportPlan(
        records
      );

    assert.deepEqual(
      first,
      second
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 22. PLAN DOES NOT MUTATE INPUT
 * --------------------------------------------------------------------------
 */

test(
  "building an import plan does not mutate input",
  () => {
    const records = [
      stateRecord(),
      districtRecord()
    ];

    const before =
      JSON.stringify(
        records
      );

    importer.buildImportPlan(
      records
    );

    const after =
      JSON.stringify(
        records
      );

    assert.equal(
      after,
      before
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 23. PERSISTENCE REQUIRES EXPLICIT ADAPTER
 * --------------------------------------------------------------------------
 */

asyncTest(
  "persistence requires an explicit adapter",
  async () => {
    const plan =
      importer.buildImportPlan([
        districtRecord()
      ]);

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
 * 24. EXPLICIT ADAPTER RECEIVES PLAN
 * --------------------------------------------------------------------------
 */

asyncTest(
  "explicit adapter receives the import plan",
  async () => {
    const plan =
      importer.buildImportPlan([
        districtRecord()
      ]);

    let received = null;

    const result =
      await importer.executeImportPlan(
        plan,
        async receivedPlan => {
          received =
            receivedPlan;

          return {
            persisted: false,
            testOnly: true
          };
        }
      );

    assert.ok(
      received
    );

    assert.equal(
      received.source_system,
      "LGD"
    );

    assert.equal(
      received.operations.length,
      1
    );

    assert.equal(
      result.count,
      1
    );

    assert.deepEqual(
      result.result,
      {
        persisted: false,
        testOnly: true
      }
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 25. SERIALIZATION IS DETERMINISTIC
 * --------------------------------------------------------------------------
 */

test(
  "import plan serialization is deterministic",
  () => {
    const plan =
      importer.buildImportPlan([
        districtRecord(),
        stateRecord()
      ]);

    const first =
      importer.serializeImportPlan(
        plan
      );

    const second =
      importer.serializeImportPlan(
        plan
      );

    assert.equal(
      first,
      second
    );

    assert.ok(
      first.endsWith("\n")
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * FINAL RESULT
 * --------------------------------------------------------------------------
 */

async function main() {
  /*
   * Allow all asynchronous tests to finish.
   *
   * asyncTest calls above start immediately and return promises.
   * This final synchronous summary is intentionally delayed one
   * microtask turn.
   */

  await new Promise(
    resolve =>
      setImmediate(resolve)
  );

  console.log("");

  console.log(
    "=============================================="
  );

  console.log(
    "LGD IMPORTER CORE VERIFICATION"
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
      "LGD_IMPORTER_CORE_TEST=FAIL"
    );

    process.exitCode = 1;

    return;
  }

  console.log(
    "LGD_IMPORTER_CORE_TEST=PASS"
  );

  console.log(
    "DATABASE_MODIFIED=NO"
  );

  console.log(
    "PRODUCTION_MODIFIED=NO"
  );
}

main().catch(error => {
  console.error(
    "LGD_IMPORTER_CORE_TEST=FAIL"
  );

  console.error(
    error.stack || error.message
  );

  process.exitCode = 1;
});
