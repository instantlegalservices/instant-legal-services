/**
 * Instant Legal Services
 * LGD → ILS Location Registry Adapter
 *
 * IMPORTANT:
 * - No network access.
 * - No database access.
 * - No filesystem access.
 * - No sitemap writes.
 * - No guessed LGD column names.
 *
 * The adapter accepts an explicitly mapped LGD snapshot.
 * The source-specific column mapping belongs outside this module.
 *
 * Input contract:
 *
 * {
 *   sourceCode,
 *   parentSourceCode,
 *   locationType,
 *   canonicalName,
 *   canonicalSlug
 * }
 *
 * The adapter generates the ILS route deterministically.
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

function assertString(value, field) {
  if (
    typeof value !== "string" ||
    value.trim() === ""
  ) {
    fail(`${field} must be a non-empty string`);
  }

  if (value !== value.trim()) {
    fail(
      `${field} must not contain leading or trailing whitespace`
    );
  }

  return value;
}

/**
 * Convert an explicitly supplied English/Latin LGD name
 * into an ILS canonical slug.
 *
 * We intentionally DO NOT transliterate unknown scripts.
 * If a name cannot produce a safe ASCII slug, the record
 * fails closed and requires an explicit reviewed slug.
 */
function slugifyLatinName(value) {
  const name =
    assertString(
      value,
      "canonicalName"
    );

  const normalized =
    name
      .normalize("NFKD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      );

  if (
    /[^\x00-\x7F]/.test(
      normalized
    )
  ) {
    fail(
      `canonicalName requires an explicit reviewed canonicalSlug: ${name}`
    );
  }

  const slug =
    normalized
      .toLowerCase()
      .replace(
        /&/g,
        " and "
      )
      .replace(
        /[^a-z0-9]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      )
      .replace(
        /-{2,}/g,
        "-"
      );

  if (!slug) {
    fail(
      `canonicalName cannot produce a canonical slug: ${name}`
    );
  }

  return assertSlug(
    slug,
    "canonicalSlug"
  );
}

function resolveSlug(row) {
  if (
    row.canonicalSlug !==
      undefined &&
    row.canonicalSlug !==
      null &&
    row.canonicalSlug !== ""
  ) {
    return assertSlug(
      row.canonicalSlug,
      "canonicalSlug"
    );
  }

  return slugifyLatinName(
    row.canonicalName
  );
}

/**
 * Generate the current ILS route.
 *
 * Existing ILS route contracts are intentionally preserved:
 *
 * STATE:
 *   /{state}/
 *
 * DISTRICT:
 *   /{state}/{district}/
 *
 * TEHSIL:
 *   /tehsil/{tehsil}/
 *
 * LOCAL_BODY:
 *   /local-body/{local-body}/
 *
 * AUTHORITY:
 *   /authority/{authority}/
 *
 * COURT is deliberately excluded because the current SEO
 * Registry feed does not publish COURT records.
 */
function buildRoute({
  locationType,
  canonicalSlug,
  stateSlug
}) {
  const slug =
    assertSlug(
      canonicalSlug,
      "canonicalSlug"
    );

  if (
    !ALLOWED_TYPES.has(
      locationType
    )
  ) {
    fail(
      `Unsupported locationType: ${locationType}`
    );
  }

  if (
    locationType ===
    "STATE"
  ) {
    return `/${slug}/`;
  }

  if (
    locationType ===
    "DISTRICT"
  ) {
    if (
      typeof stateSlug !==
        "string" ||
      !stateSlug
    ) {
      fail(
        "DISTRICT requires stateSlug"
      );
    }

    return `/${assertSlug(
      stateSlug,
      "stateSlug"
    )}/${slug}/`;
  }

  if (
    locationType ===
    "TEHSIL"
  ) {
    return `/tehsil/${slug}/`;
  }

  if (
    locationType ===
    "LOCAL_BODY"
  ) {
    return `/local-body/${slug}/`;
  }

  if (
    locationType ===
    "AUTHORITY"
  ) {
    return `/authority/${slug}/`;
  }

  fail(
    `Unsupported route generation type: ${locationType}`
  );
}

/**
 * Adapt one explicitly mapped LGD source row.
 *
 * No source-column discovery happens here.
 */
function adaptLgdRow(row) {
  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row)
  ) {
    fail(
      "LGD source row must be an object"
    );
  }

  const locationType =
    assertString(
      row.locationType,
      "locationType"
    );

  const sourceCode =
    assertSourceCode(
      row.sourceCode
    );

  const canonicalName =
    assertString(
      row.canonicalName,
      "canonicalName"
    );

  const canonicalSlug =
    resolveSlug(
      row
    );

  let stateSlug =
    null;

  if (
    locationType ===
    "DISTRICT"
  ) {
    stateSlug =
      assertSlug(
        row.stateSlug,
        "stateSlug"
      );
  }

  const currentRoute =
    buildRoute({
      locationType,
      canonicalSlug,
      stateSlug
    });

  const parentSourceCode =
    row.parentSourceCode ===
      undefined ||
    row.parentSourceCode ===
      null ||
    row.parentSourceCode ===
      ""
      ? null
      : assertSourceCode(
          row.parentSourceCode,
          "parentSourceCode"
        );

  return {
    sourceSystem: "LGD",
    locationType,
    sourceCode,
    parentSourceCode,
    canonicalName,
    canonicalSlug,
    currentRoute
  };
}

/**
 * Adapt a complete explicitly mapped LGD snapshot.
 *
 * Duplicate routes, duplicate identities and malformed
 * records are rejected by the normalized validator.
 */
function adaptLgdSnapshot(rows) {
  if (
    !Array.isArray(rows)
  ) {
    fail(
      "LGD snapshot must be an array"
    );
  }

  const normalized =
    rows.map(
      adaptLgdRow
    );

  return validateNormalizedLgdRows(
    normalized
  );
}

module.exports = {
  slugifyLatinName,
  resolveSlug,
  buildRoute,
  adaptLgdRow,
  adaptLgdSnapshot
};
