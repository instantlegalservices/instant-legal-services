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

/**
 * Build a typed source identity.
 *
 * Source identity is intentionally:
 *
 *   LOCATION_TYPE + SOURCE_CODE
 *
 * This prevents collisions when two entity types happen
 * to expose the same opaque source code.
 */
function buildIdentity(
  locationType,
  sourceCode
) {
  return `${locationType}:${sourceCode}`;
}

/**
 * Build stable hierarchy indexes.
 *
 * The normalized sourceCode remains opaque.
 * We never reinterpret or transform it.
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
      buildIdentity(
        row.locationType,
        row.sourceCode
      );

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
      const expectedParentType =
        EXPECTED_PARENT_TYPES[
          row.locationType
        ];

      if (
        expectedParentType === null ||
        expectedParentType === undefined
      ) {
        fail(
          `Invalid parent configuration for ` +
          `${row.locationType}:${row.sourceCode}`
        );
      }

      const parentIdentity =
        buildIdentity(
          expectedParentType,
          row.parentSourceCode
        );

      if (
        !childrenByParent.has(
          parentIdentity
        )
      ) {
        childrenByParent.set(
          parentIdentity,
          []
        );
      }

      childrenByParent
        .get(parentIdentity)
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
 * Resolve a row's parent using:
 *
 *   expected parent type
 *   +
 *   opaque parent source code
 *
 * We deliberately do NOT search every entity type for the
 * same sourceCode.
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

  const expectedParentType =
    EXPECTED_PARENT_TYPES[
      row.locationType
    ];

  if (
    expectedParentType === null ||
    expectedParentType === undefined
  ) {
    fail(
      `Invalid parent configuration for ` +
      `${row.locationType}:${row.sourceCode}`
    );
  }

  const parentIdentity =
    buildIdentity(
      expectedParentType,
      row.parentSourceCode
    );

  const parent =
    index.byIdentity.get(
      parentIdentity
    );

  if (!parent) {
    fail(
      `Missing parent source identity for ` +
      `${row.locationType}:${row.sourceCode}: ` +
      `${parentIdentity}`
    );
  }

  return parent;
}

/**
 * Validate parent type.
 */
function assertParentType(
  row,
  parent
) {
  const expected =
    EXPECTED_PARENT_TYPES[
      row.locationType
    ];

  if (
    expected === undefined
  ) {
    fail(
      `Unsupported hierarchy location type: ` +
      `${row.locationType}`
    );
  }

  /**
   * STATE is the root entity.
   */
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

    if (
      parent !== null &&
      parent !== undefined
    ) {
      fail(
        `STATE cannot have a parent entity: ` +
        `${row.sourceCode}`
      );
    }

    return true;
  }

  /**
   * Every non-root type requires a parent.
   */
  if (!parent) {
    fail(
      `Missing parent for ` +
      `${row.locationType}:${row.sourceCode}`
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

  if (
    parent.sourceCode !==
    row.parentSourceCode
  ) {
    fail(
      `Parent source identity mismatch for ` +
      `${row.locationType}:${row.sourceCode}: ` +
      `expected ${row.parentSourceCode}, got ${parent.sourceCode}`
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
      `DISTRICT requires STATE parent: ` +
      `${row.sourceCode}`
    );
  }

  if (
    parent.canonicalSlug ===
    undefined ||
    row.canonicalSlug ===
    undefined
  ) {
    fail(
      `DISTRICT route validation requires canonical slugs: ` +
      `${row.sourceCode}`
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
  buildIdentity,
  buildHierarchyIndex,
  findParent,
  assertParentType,
  validateHierarchy,
  validateDistrictRouteHierarchy,
  validateRouteHierarchy,
  buildHierarchyReport
};
