/**
 * Instant Legal Services
 * LGD Location Registry Importer Contract Test
 *
 * ACTION 1088.284
 *
 * Purpose:
 * - Define and verify the LGD importer contract.
 * - Validate normalization before database integration.
 * - Verify typed LGD identity semantics.
 * - Verify deterministic/idempotent identity handling.
 *
 * HARD SAFETY RULES
 * -----------------
 * 1. No database access.
 * 2. No Supabase access.
 * 3. No network access.
 * 4. No filesystem writes.
 * 5. No Git operations.
 * 6. No production data.
 * 7. No mutation of existing importer code.
 *
 * This is a pure contract test.
 */

"use strict";

const assert = require("node:assert/strict");

/*
 * --------------------------------------------------------------------------
 * Contract constants
 * --------------------------------------------------------------------------
 */

const SOURCE_SYSTEM = "LGD";

const ALLOWED_LOCATION_TYPES = new Set([
  "STATE",
  "DISTRICT",
  "TEHSIL",
  "LOCAL_BODY",
  "AUTHORITY",
  "COURT"
]);

/*
 * --------------------------------------------------------------------------
 * Basic helpers
 * --------------------------------------------------------------------------
 */

function fail(message) {
  throw new Error(message);
}

function assertObject(value, field) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    fail(`${field} must be an object`);
  }

  return value;
}

function assertNonEmptyString(value, field) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    fail(`${field} must be a non-empty string`);
  }

  if (value !== value.trim()) {
    fail(`${field} must not contain surrounding whitespace`);
  }

  return value;
}

/*
 * --------------------------------------------------------------------------
 * LGD identity normalization
 * --------------------------------------------------------------------------
 *
 * This function intentionally performs NO database operation.
 *
 * It produces the exact identity/provenance shape expected by the
 * Location Registry migration.
 */

function normalizeLGDRecord(record) {
  assertObject(record, "record");

  const sourceSystem = assertNonEmptyString(
    record.source_system ?? SOURCE_SYSTEM,
    "source_system"
  );

  if (sourceSystem !== SOURCE_SYSTEM) {
    fail(
      `Unsupported source_system: ${sourceSystem}`
    );
  }

  const sourceCode = assertNonEmptyString(
    record.source_code,
    "source_code"
  );

  const locationType = assertNonEmptyString(
    record.location_type,
    "location_type"
  );

  if (!ALLOWED_LOCATION_TYPES.has(locationType)) {
    fail(
      `Unsupported location_type: ${locationType}`
    );
  }

  const canonicalName = assertNonEmptyString(
    record.canonical_name,
    "canonical_name"
  );

  let parentSourceCode = null;

  if (
    record.parent_source_code !== undefined &&
    record.parent_source_code !== null
  ) {
    parentSourceCode = assertNonEmptyString(
      record.parent_source_code,
      "parent_source_code"
    );
  }

  return {
    source_system: SOURCE_SYSTEM,
    source_code: sourceCode,
    location_type: locationType,
    canonical_name: canonicalName,
    parent_source_code: parentSourceCode
  };
}

/*
 * --------------------------------------------------------------------------
 * Typed identity key
 * --------------------------------------------------------------------------
 *
 * This MUST match the database uniqueness contract:
 *
 * (source_system, location_type, source_code)
 */

function typedIdentityKey(record) {
  const normalized =
    normalizeLGDRecord(record);

  return [
    normalized.source_system,
    normalized.location_type,
    normalized.source_code
  ].join(":");
}

/*
 * --------------------------------------------------------------------------
 * Batch validation
 * --------------------------------------------------------------------------
 */

function validateLGDBatch(records) {
  if (!Array.isArray(records)) {
    fail("LGD input must be an array");
  }

  const seen = new Set();

  const normalized = records.map(
    normalizeLGDRecord
  );

  for (const record of normalized) {
    const key =
      typedIdentityKey(record);

    if (seen.has(key)) {
      fail(
        `Duplicate LGD typed identity: ${key}`
      );
    }

    seen.add(key);
  }

  return normalized;
}

/*
 * --------------------------------------------------------------------------
 * Deterministic serialization
 * --------------------------------------------------------------------------
 */

function serializeNormalizedRecords(records) {
  const normalized =
    validateLGDBatch(records);

  return (
    JSON.stringify(
      normalized,
      null,
      2
    ) + "\n"
  );
}

/*
 * --------------------------------------------------------------------------
 * Test runner
 * --------------------------------------------------------------------------
 */

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();

    passed += 1;

    console.log(
      `PASS: ${name}`
    );
  } catch (error) {
    failed += 1;

    console.error(
      `FAIL: ${name}`
    );

    console.error(
      `      ${error.message}`
    );
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

function validState() {
  return {
    source_system: "LGD",
    source_code: "09",
    location_type: "STATE",
    canonical_name: "Uttar Pradesh",
    parent_source_code: null
  };
}

function validDistrict() {
  return {
    source_system: "LGD",
    source_code: "0927",
    location_type: "DISTRICT",
    canonical_name: "Bareilly",
    parent_source_code: "09"
  };
}

/*
 * --------------------------------------------------------------------------
 * 1. Valid LGD record
 * --------------------------------------------------------------------------
 */

test(
  "valid LGD state record is accepted",
  () => {
    const result =
      normalizeLGDRecord(
        validState()
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
 * 2. Valid child record
 * --------------------------------------------------------------------------
 */

test(
  "valid LGD district with parent source code is accepted",
  () => {
    const result =
      normalizeLGDRecord(
        validDistrict()
      );

    assert.equal(
      result.parent_source_code,
      "09"
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 3. Default source system
 * --------------------------------------------------------------------------
 */

test(
  "missing source_system defaults to LGD",
  () => {
    const record = {
      source_code: "09",
      location_type: "STATE",
      canonical_name: "Uttar Pradesh",
      parent_source_code: null
    };

    const result =
      normalizeLGDRecord(
        record
      );

    assert.equal(
      result.source_system,
      "LGD"
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 4. Source system must be LGD
 * --------------------------------------------------------------------------
 */

expectThrow(
  "non-LGD source system is rejected",
  () => {
    normalizeLGDRecord({
      ...validState(),
      source_system: "OTHER"
    });
  }
);

/*
 * --------------------------------------------------------------------------
 * 5. source_code required
 * --------------------------------------------------------------------------
 */

expectThrow(
  "missing source_code is rejected",
  () => {
    const record = {
      ...validState()
    };

    delete record.source_code;

    normalizeLGDRecord(
      record
    );
  }
);

expectThrow(
  "blank source_code is rejected",
  () => {
    normalizeLGDRecord({
      ...validState(),
      source_code: "   "
    });
  }
);

/*
 * --------------------------------------------------------------------------
 * 6. location_type required
 * --------------------------------------------------------------------------
 */

expectThrow(
  "missing location_type is rejected",
  () => {
    const record = {
      ...validState()
    };

    delete record.location_type;

    normalizeLGDRecord(
      record
    );
  }
);

expectThrow(
  "unsupported location_type is rejected",
  () => {
    normalizeLGDRecord({
      ...validState(),
      location_type: "UNKNOWN"
    });
  }
);

/*
 * --------------------------------------------------------------------------
 * 7. canonical_name required
 * --------------------------------------------------------------------------
 */

expectThrow(
  "missing canonical_name is rejected",
  () => {
    const record = {
      ...validState()
    };

    delete record.canonical_name;

    normalizeLGDRecord(
      record
    );
  }
);

expectThrow(
  "blank canonical_name is rejected",
  () => {
    normalizeLGDRecord({
      ...validState(),
      canonical_name: ""
    });
  }
);

/*
 * --------------------------------------------------------------------------
 * 8. Parent source code may be NULL
 * --------------------------------------------------------------------------
 */

test(
  "parent_source_code may be NULL",
  () => {
    const result =
      normalizeLGDRecord({
        ...validState(),
        parent_source_code: null
      });

    assert.equal(
      result.parent_source_code,
      null
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 9. Parent source code cannot be blank
 * --------------------------------------------------------------------------
 */

expectThrow(
  "blank parent_source_code is rejected",
  () => {
    normalizeLGDRecord({
      ...validDistrict(),
      parent_source_code: "   "
    });
  }
);

/*
 * --------------------------------------------------------------------------
 * 10. Same code across different location types
 * --------------------------------------------------------------------------
 *
 * This MUST be allowed because the database uniqueness contract includes
 * location_type.
 */

test(
  "same LGD source code across different types is allowed",
  () => {
    const records = [
      {
        ...validState(),
        source_code: "09"
      },
      {
        ...validDistrict(),
        source_code: "09"
      }
    ];

    const result =
      validateLGDBatch(
        records
      );

    assert.equal(
      result.length,
      2
    );

    assert.notEqual(
      typedIdentityKey(result[0]),
      typedIdentityKey(result[1])
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 11. Same code + same type is duplicate
 * --------------------------------------------------------------------------
 */

expectThrow(
  "same LGD source code and type is rejected",
  () => {
    validateLGDBatch([
      validDistrict(),
      {
        ...validDistrict(),
        canonical_name: "Duplicate Bareilly"
      }
    ]);
  }
);

/*
 * --------------------------------------------------------------------------
 * 12. Different source system is outside LGD contract
 * --------------------------------------------------------------------------
 */

expectThrow(
  "different source system is rejected by LGD importer contract",
  () => {
    validateLGDBatch([
      {
        ...validDistrict(),
        source_system: "OTHER"
      }
    ]);
  }
);

/*
 * --------------------------------------------------------------------------
 * 13. Duplicate input records
 * --------------------------------------------------------------------------
 */

expectThrow(
  "duplicate LGD input records are rejected",
  () => {
    validateLGDBatch([
      validState(),
      validState()
    ]);
  }
);

/*
 * --------------------------------------------------------------------------
 * 14. Deterministic normalization
 * --------------------------------------------------------------------------
 */

test(
  "normalization is deterministic",
  () => {
    const first =
      normalizeLGDRecord(
        validDistrict()
      );

    const second =
      normalizeLGDRecord(
        validDistrict()
      );

    assert.deepEqual(
      first,
      second
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 15. Deterministic serialization
 * --------------------------------------------------------------------------
 */

test(
  "normalized batch serialization is deterministic",
  () => {
    const records = [
      validDistrict(),
      validState()
    ];

    const first =
      serializeNormalizedRecords(
        records
      );

    const second =
      serializeNormalizedRecords(
        records
      );

    assert.equal(
      first,
      second
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 16. Identity key is deterministic
 * --------------------------------------------------------------------------
 */

test(
  "typed LGD identity key is deterministic",
  () => {
    const first =
      typedIdentityKey(
        validDistrict()
      );

    const second =
      typedIdentityKey(
        validDistrict()
      );

    assert.equal(
      first,
      second
    );

    assert.equal(
      first,
      "LGD:DISTRICT:0927"
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 17. Parent relationship is preserved
 * --------------------------------------------------------------------------
 */

test(
  "parent_source_code is preserved exactly",
  () => {
    const result =
      normalizeLGDRecord(
        validDistrict()
      );

    assert.equal(
      result.parent_source_code,
      "09"
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 18. Leading/trailing whitespace fails closed
 * --------------------------------------------------------------------------
 */

expectThrow(
  "source_code with surrounding whitespace is rejected",
  () => {
    normalizeLGDRecord({
      ...validState(),
      source_code: " 09"
    });
  }
);

expectThrow(
  "canonical_name with surrounding whitespace is rejected",
  () => {
    normalizeLGDRecord({
      ...validState(),
      canonical_name: "Uttar Pradesh "
    });
  }
);

/*
 * --------------------------------------------------------------------------
 * 19. Null record rejected
 * --------------------------------------------------------------------------
 */

expectThrow(
  "null record is rejected",
  () => {
    normalizeLGDRecord(
      null
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 20. Non-array batch rejected
 * --------------------------------------------------------------------------
 */

expectThrow(
  "non-array LGD input is rejected",
  () => {
    validateLGDBatch(
      validState()
    );
  }
);

/*
 * --------------------------------------------------------------------------
 * 21. Importer contract must not mutate source records
 * --------------------------------------------------------------------------
 */

test(
  "normalization does not mutate input record",
  () => {
    const source =
      validDistrict();

    const before =
      JSON.stringify(
        source
      );

    normalizeLGDRecord(
      source
    );

    const after =
      JSON.stringify(
        source
      );

    assert.equal(
      after,
      before
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
  "LGD IMPORTER CONTRACT TEST RESULT"
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
    "LGD_IMPORTER_CONTRACT_TEST=FAIL"
  );

  process.exitCode = 1;
} else {
  console.log(
    "LGD_IMPORTER_CONTRACT_TEST=PASS"
  );
}
