/**
 * Instant Legal Services
 * LGD Location Registry Importer
 *
 * ACTION 1088.285
 *
 * Purpose:
 * - Normalize and validate LGD records against the verified
 *   Location Registry identity contract.
 * - Validate parent identity references when a complete batch
 *   is supplied.
 * - Produce a deterministic persistence plan.
 * - Keep database persistence behind an explicit adapter.
 *
 * HARD SAFETY RULES
 * -----------------
 * 1. No database connection.
 * 2. No Supabase connection.
 * 3. No network access.
 * 4. No filesystem writes.
 * 5. No Git operations.
 * 6. No implicit production side effects.
 * 7. Persistence is supplied explicitly by the caller.
 *
 * Verified database identity contract:
 *
 *   (source_system, location_type, source_code)
 */

"use strict";

/*
 * --------------------------------------------------------------------------
 * CONTRACT CONSTANTS
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
 * BASIC VALIDATION HELPERS
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
    fail(
      `${field} must not contain surrounding whitespace`
    );
  }

  return value;
}

function assertLocationType(value) {
  const locationType =
    assertNonEmptyString(
      value,
      "location_type"
    );

  if (
    !ALLOWED_LOCATION_TYPES.has(
      locationType
    )
  ) {
    fail(
      `Unsupported location_type: ${locationType}`
    );
  }

  return locationType;
}

/*
 * --------------------------------------------------------------------------
 * LGD RECORD NORMALIZATION
 * --------------------------------------------------------------------------
 *
 * Accepted importer aliases:
 *
 *   lgd_code            -> source_code
 *   name                -> canonical_name
 *   level               -> location_type
 *   parent_lgd_code     -> parent_source_code
 *
 * Normalized output always uses the Location Registry schema names.
 */

function normalizeLGDRecord(record) {
  assertObject(
    record,
    "record"
  );

  const sourceSystem =
    record.source_system === undefined
      ? SOURCE_SYSTEM
      : assertNonEmptyString(
          record.source_system,
          "source_system"
        );

  if (
    sourceSystem !== SOURCE_SYSTEM
  ) {
    fail(
      `Unsupported source_system: ${sourceSystem}`
    );
  }

  const sourceCodeValue =
    record.source_code ??
    record.lgd_code;

  const nameValue =
    record.canonical_name ??
    record.name;

  const locationTypeValue =
    record.location_type ??
    record.level;

  const parentValue =
    record.parent_source_code ??
    record.parent_lgd_code;

  const sourceCode =
    assertNonEmptyString(
      sourceCodeValue,
      "source_code"
    );

  const canonicalName =
    assertNonEmptyString(
      nameValue,
      "canonical_name"
    );

  const locationType =
    assertLocationType(
      locationTypeValue
    );

  let parentSourceCode = null;

  if (
    parentValue !== undefined &&
    parentValue !== null
  ) {
    parentSourceCode =
      assertNonEmptyString(
        parentValue,
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
 * TYPED IDENTITY
 * --------------------------------------------------------------------------
 *
 * MUST match the verified database unique identity:
 *
 *   source_system
 *   location_type
 *   source_code
 */

function identityKey(record) {
  const normalized =
    normalizeLGDRecord(
      record
    );

  return [
    normalized.source_system,
    normalized.location_type,
    normalized.source_code
  ].join(":");
}

/*
 * --------------------------------------------------------------------------
 * EXISTING IDENTITY NORMALIZATION
 * --------------------------------------------------------------------------
 */

function normalizeExistingIdentities(
  identities
) {
  if (
    identities === undefined ||
    identities === null
  ) {
    return new Set();
  }

  if (
    !(identities instanceof Set)
  ) {
    fail(
      "existingIdentities must be a Set"
    );
  }

  const result =
    new Set();

  for (
    const identity
    of identities
  ) {
    result.add(
      assertNonEmptyString(
        identity,
        "existing identity"
      )
    );
  }

  return result;
}

/*
 * --------------------------------------------------------------------------
 * BATCH NORMALIZATION
 * --------------------------------------------------------------------------
 *
 * This function performs validation only.
 *
 * It does NOT:
 * - connect to Supabase
 * - query PostgreSQL
 * - write rows
 * - modify files
 */

function normalizeLGDBatch(
  records,
  options = {}
) {
  if (!Array.isArray(records)) {
    fail(
      "LGD records must be an array"
    );
  }

  const normalized =
    records.map(
      normalizeLGDRecord
    );

  const seen =
    new Set();

  for (
    const record
    of normalized
  ) {
    const key =
      identityKey(
        record
      );

    if (
      seen.has(key)
    ) {
      fail(
        `Duplicate LGD typed identity: ${key}`
      );
    }

    seen.add(key);
  }

  const existingIdentities =
    normalizeExistingIdentities(
      options.existingIdentities
    );

  const allIdentities =
    new Set([
      ...existingIdentities,
      ...seen
    ]);

  for (
    const record
    of normalized
  ) {
    if (
      record.parent_source_code === null
    ) {
      continue;
    }

    if (
      record.parent_source_code ===
      record.source_code
    ) {
      fail(
        `LGD record cannot be its own parent: ${identityKey(
          record
        )}`
      );
    }

    /*
     * Parent code is preserved as authoritative source
     * identity data. No parent type is guessed here.
     *
     * If the integration layer supplies an explicit
     * parentIdentityBySourceCode map, it is checked.
     */
    if (
      options.parentIdentityBySourceCode
    ) {
      const parentKey =
        options.parentIdentityBySourceCode.get(
          record.parent_source_code
        );

      if (!parentKey) {
        fail(
          `Unresolved LGD parent_source_code: ${record.parent_source_code}`
        );
      }

      if (
        !allIdentities.has(
          parentKey
        )
      ) {
        fail(
          `Parent identity is not available: ${parentKey}`
        );
      }
    }
  }

  return normalized;
}

/*
 * --------------------------------------------------------------------------
 * DETERMINISTIC IMPORT PLAN
 * --------------------------------------------------------------------------
 *
 * No database operation happens here.
 */

function buildImportPlan(
  records,
  options = {}
) {
  const normalized =
    normalizeLGDBatch(
      records,
      options
    );

  const operations =
    normalized
      .map(
        record => ({
          operation: "UPSERT",

          identity:
            identityKey(
              record
            ),

          row: {
            source_system:
              record.source_system,

            source_code:
              record.source_code,

            location_type:
              record.location_type,

            canonical_name:
              record.canonical_name,

            parent_source_code:
              record.parent_source_code
          }
        })
      )
      .sort(
        (a, b) =>
          a.identity.localeCompare(
            b.identity
          )
      );

  return {
    source_system:
      SOURCE_SYSTEM,

    count:
      operations.length,

    operations
  };
}

/*
 * --------------------------------------------------------------------------
 * PERSISTENCE ADAPTER
 * --------------------------------------------------------------------------
 *
 * The importer does NOT own a database connection.
 *
 * The caller must explicitly supply the persistence adapter.
 */

async function executeImportPlan(
  plan,
  persistenceAdapter
) {
  assertObject(
    plan,
    "plan"
  );

  if (
    typeof persistenceAdapter !==
    "function"
  ) {
    fail(
      "persistenceAdapter must be a function"
    );
  }

  if (
    plan.source_system !==
    SOURCE_SYSTEM
  ) {
    fail(
      "Import plan source_system must be LGD"
    );
  }

  if (
    !Array.isArray(
      plan.operations
    )
  ) {
    fail(
      "Import plan operations must be an array"
    );
  }

  /*
   * Give the adapter a JSON-safe snapshot so that the
   * adapter cannot mutate the original plan object.
   */
  const snapshot =
    JSON.parse(
      JSON.stringify(
        plan
      )
    );

  const result =
    await persistenceAdapter(
      snapshot
    );

  return {
    source_system:
      SOURCE_SYSTEM,

    count:
      plan.operations.length,

    result
  };
}

/*
 * --------------------------------------------------------------------------
 * DETERMINISTIC SERIALIZATION
 * --------------------------------------------------------------------------
 */

function serializeImportPlan(
  plan
) {
  assertObject(
    plan,
    "plan"
  );

  return (
    JSON.stringify(
      plan,
      null,
      2
    ) + "\n"
  );
}

/*
 * --------------------------------------------------------------------------
 * PUBLIC API
 * --------------------------------------------------------------------------
 */

module.exports = {
  SOURCE_SYSTEM,
  ALLOWED_LOCATION_TYPES,
  normalizeLGDRecord,
  identityKey,
  normalizeLGDBatch,
  buildImportPlan,
  executeImportPlan,
  serializeImportPlan
};

/*
 * --------------------------------------------------------------------------
 * DIRECT EXECUTION SAFETY CHECK
 * --------------------------------------------------------------------------
 *
 * Running this file directly only proves that the importer module
 * can load. It does NOT import anything into a database.
 */

if (
  require.main === module
) {
  console.log(
    "LGD_IMPORTER=READY"
  );

  console.log(
    "MODE=VALIDATION_AND_PLANNING_ONLY"
  );

  console.log(
    "DATABASE_MODIFIED=NO"
  );

  console.log(
    "PRODUCTION_MODIFIED=NO"
  );
}
