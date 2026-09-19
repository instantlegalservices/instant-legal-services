/**
 * Instant Legal Services
 * LGD Location Hierarchy Integrity
 *
 * Purpose:
 * - Validate parent/child identity relationships in a
 *   normalized LGD snapshot.
 * - Keep source identity separate from URL generation.
 * - Fail closed on broken hierarchy.
 *
 * IMPORTANT:
 * - No network.
 * - No database.
 * - No filesystem.
 * - No sitemap writes.
 * - No assumptions about LGD's raw column names.
 *
 * Input is the already-normalized ILS LGD contract.
 */

"use strict";

const {
  ALLOWED_TYPES,
  assertSourceCode,
  assertSlug,
  validateNormalizedLgdRows
} = require("./lgd-location-ingestion");

function fail(message) {
  throw new Error(message);
}

function assertRows(rows) {
  if (!Array.isArray(rows)) {
    fail(
      "LGD hierarchy input must be an array"
    );
  }

  return rows;
}

/**
 * Build stable identity indexes.
 *
 * Identity:
 *   locationType + sourceCode
 *
 * Parent identity:
 *   parentSourceCode
 *
 * The parent source code is intentionally opaque.
 * We only resolve it against the normalized snapshot.
 */
function buildHierarchyIndex(rows) {
  const normalized =
    validateNormalizedLgdRows(
      assertRows(rows)
    );

  const byIdentity =
    new Map();

  const childrenByParent =
    new Map();

  for (const row of normalized) {
    const identity =
      `${row.locationType}:${row.sourceCode}`;

    if (
      byIdentity.has(identity)
    ) {
      fail(
        `Duplicate normalized identity: ${identity}`
      );
    }

    byIdentity.set(
      identity,
      row
    );

    if (
      row.parentSourceCode !== null
    ) {
      const key =
        row.parentSourceCode;

      if (
        !childrenByParent.has(key)
      ) {
        childrenByParent.set(
          key,
          []
        );
      }

      childrenByParent
        .get(key)
        .push(row);
    }
  }

  return {
    normalized,
    byIdentity,
    childrenByParent
  };
}

/**
 * Find a source-code parent.
 *
 * LGD source codes are intentionally treated as opaque,
 * therefore the relationship is resolved only within
 * the supplied snapshot.
 *
 * Parent type is validated separately.
 */
function findParent(
  row,
  index
) {
  if (
    row.parentSourceCode === null
  ) {
    return null;
  }

  const candidates = [];

  for (
    const candidate
    of index.normalized
  ) {
    if (
      candidate.sourceCode ===
      row.parentSourceCode
    ) {
      candidates.push(
        candidate
      );
    }
  }

  if (
    candidates.length === 0
  ) {
    fail(
      `Missing parent source identity for ` +
      `${row.locationType}:${row.sourceCode}: ` +
      `${row.parentSourceCode}`
    );
  }

  if (
    candidates.length > 1
  ) {
    fail(
      `Ambiguous parent source identity for ` +
      `${row.locationType}:${row.sourceCode}: ` +
      `${row.parentSourceCode}`
    );
  }

  return candidates[0];
}

/**
 * Expected parent types in the normalized ILS hierarchy.
 *
 * STATE:
 *   root
 *
 * DISTRICT:
 *   STATE
 *
 * TEHSIL:
 *   DISTRICT
 *
 * LOCAL_BODY:
 *   DISTRICT
 *
 * AUTHORITY:
 *   DISTRICT
 *
 * NOTE:
 * This is an ILS normalization contract.
 * It does NOT claim that these are the exact raw LGD
 * column relationships until the official source mapping
 * is explicitly verified.
 */
const EXPECTED_PARENT_TYPES =
  Object.freeze({
    STATE: null,
    DISTRICT: "STATE",
    TEHSIL: "DISTRICT",
    LOCAL_BODY: "DISTRICT",
    AUTHORITY: "DISTRICT"
  });

function assertParentType(
  row,
  parent
) {
  const expected =
    EXPECTED_PARENT_TYPES[
      row.locationType
    ];

  if (
    expected === null
  ) {
    if (
      row.parentSourceCode !== null
    ) {
      fail(
        `STATE cannot have a parentSourceCode: ` +
        `${row.sourceCode}`
      );
    }

    return true;
  }

  if (!parent) {
    fail(
      `Missing parent for ${row.locationType}:${row.sourceCode}`
    );
  }

  if (
    parent.locationType !==
    expected
  ) {
    fail(
      `Invalid parent type for ` +
      `${row.locationType}:${row.sourceCode}: ` +
      `expected ${expected}, got ${parent.locationType}`
    );
  }

  return true;
}

/**
 * Verify that every normalized row has a valid hierarchy.
 */
function validateHierarchy(rows) {
  const index =
    buildHierarchyIndex(
      rows
    );

  for (
    const row
    of index.normalized
  ) {
    const parent =
      findParent(
        row,
        index
      );

    assertParentType(
      row,
      parent
    );
  }

  return Object.freeze(
    index.normalized
  );
}

/**
 * Validate that a DISTRICT route uses the same
 * state identity represented by its parent.
 *
 * Example:
 *
 * parent:
 *   canonicalSlug = uttar-pradesh
 *
 * district:
 *   /uttar-pradesh/bareilly/
 *
 * must pass.
 */
function validateDistrictRouteHierarchy(
  row,
  parent
) {
  if (
    row.locationType !==
    "DISTRICT"
  ) {
    return true;
  }

  if (
    !parent ||
    parent.locationType !==
    "STATE"
  ) {
    fail(
      `DISTRICT requires STATE parent: ${row.sourceCode}`
    );
  }

  const expectedRoute =
    `/${parent.canonicalSlug}/${row.canonicalSlug}/`;

  if (
    row.currentRoute !==
    expectedRoute
  ) {
    fail(
      `DISTRICT route does not match parent STATE: ` +
      `${row.currentRoute} != ${expectedRoute}`
    );
  }

  return true;
}

/**
 * Validate every route against its resolved parent.
 */
function validateRouteHierarchy(
  rows
) {
  const index =
    buildHierarchyIndex(
      rows
    );

  for (
    const row
    of index.normalized
  ) {
    const parent =
      findParent(
        row,
        index
      );

    assertParentType(
      row,
      parent
    );

    validateDistrictRouteHierarchy(
      row,
      parent
    );
  }

  return Object.freeze(
    index.normalized
  );
}

/**
 * Deterministic hierarchy report.
 */
function buildHierarchyReport(
  rows
) {
  const normalized =
    validateRouteHierarchy(
      rows
    );

  const counts = {};

  for (
    const type
    of ALLOWED_TYPES
  ) {
    counts[type] =
      normalized.filter(
        row =>
          row.locationType ===
          type
      ).length;
  }

  return Object.freeze({
    status: "PASS",
    total:
      normalized.length,
    counts,
    identities:
      normalized.map(
        row => ({
          locationType:
            row.locationType,
          sourceCode:
            row.sourceCode,
          parentSourceCode:
            row.parentSourceCode
        })
      )
  });
}

module.exports = {
  EXPECTED_PARENT_TYPES,
  buildHierarchyIndex,
  findParent,
  assertParentType,
  validateHierarchy,
  validateDistrictRouteHierarchy,
  validateRouteHierarchy,
  buildHierarchyReport
};
