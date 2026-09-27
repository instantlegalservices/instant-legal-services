/**
 * Instant Legal Services
 * LGD Location Ingestion Contract + Dry-Run Validator
 *
 * Purpose:
 * - Validate normalized records received from official LGD source.
 * - No network access.
 * - No database access.
 * - No filesystem writes.
 * - No sitemap writes.
 * - No production mutation.
 *
 * IMPORTANT:
 * This module validates a normalized LGD contract.
 * It intentionally does not guess the live LGD download format.
 */

"use strict";

const ALLOWED_TYPES = new Set([
  "STATE",
  "DISTRICT",
  "TEHSIL",
  "LOCAL_BODY",
  "AUTHORITY"
]);

const MAX_NAME_LENGTH = 500;
const MAX_CODE_LENGTH = 128;
const MAX_SLUG_LENGTH = 200;
const MAX_ROUTE_LENGTH = 2048;

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

function assertString(value, field, maxLength) {
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

  if (value.length > maxLength) {
    fail(`${field} exceeds maximum length`);
  }

  if (/[\u0000-\u001F\u007F]/.test(value)) {
    fail(`${field} contains control characters`);
  }

  return value;
}

function assertSourceCode(
  value,
  field = "sourceCode"
) {
  const code =
    assertString(
      value,
      field,
      MAX_CODE_LENGTH
    );

  /*
   * Keep LGD source identifiers opaque.
   * We do NOT assume numeric-only format.
   */
  if (/\s/.test(code)) {
    fail(
      `${field} must not contain whitespace`
    );
  }

  return code;
}

function assertSlug(
  value,
  field = "canonicalSlug"
) {
  const slug =
    assertString(
      value,
      field,
      MAX_SLUG_LENGTH
    );

  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  ) {
    fail(
      `${field} is not a canonical lowercase slug: ${slug}`
    );
  }

  return slug;
}

function assertRoute(
  value,
  field = "currentRoute"
) {
  const route =
    assertString(
      value,
      field,
      MAX_ROUTE_LENGTH
    );

  if (
    !route.startsWith("/") ||
    !route.endsWith("/")
  ) {
    fail(
      `${field} must start and end with /`
    );
  }

  if (
    route.includes("\\") ||
    route.includes("?") ||
    route.includes("#") ||
    route.includes("//")
  ) {
    fail(
      `${field} contains a forbidden URL/path construct`
    );
  }

  const segments =
    route
      .split("/")
      .filter(Boolean);

  for (
    const segment of segments
  ) {
    if (
      segment === "." ||
      segment === ".." ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
        segment
      )
    ) {
      fail(
        `${field} contains a non-canonical route segment: ${segment}`
      );
    }
  }

  return route;
}

function assertType(value) {
  const type =
    assertString(
      value,
      "locationType",
      32
    );

  if (
    !ALLOWED_TYPES.has(type)
  ) {
    fail(
      `Unsupported LGD locationType: ${type}`
    );
  }

  return type;
}

function assertParentSourceCode(
  value,
  field = "parentSourceCode"
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  return assertSourceCode(
    value,
    field
  );
}

function assertRouteShape(
  type,
  route
) {
  const segments =
    route
      .split("/")
      .filter(Boolean);

  if (
    type === "STATE" &&
    segments.length !== 1
  ) {
    fail(
      `STATE route must have exactly one segment: ${route}`
    );
  }

  if (
    type === "DISTRICT"
  ) {
    if (
      segments.length !== 2
    ) {
      fail(
        `DISTRICT route must have exactly two segments: ${route}`
      );
    }

    if (
      [
        "tehsil",
        "local-body",
        "authority"
      ].includes(
        segments[0]
      )
    ) {
      fail(
        `DISTRICT route uses a reserved typed namespace: ${route}`
      );
    }
  }

  if (
    type === "TEHSIL"
  ) {
    if (
      segments.length !== 2 ||
      segments[0] !== "tehsil"
    ) {
      fail(
        `TEHSIL route must be /tehsil/{slug}/: ${route}`
      );
    }
  }

  if (
    type === "LOCAL_BODY"
  ) {
    if (
      segments.length !== 2 ||
      segments[0] !== "local-body"
    ) {
      fail(
        `LOCAL_BODY route must be /local-body/{slug}/: ${route}`
      );
    }
  }

  if (
    type === "AUTHORITY"
  ) {
    if (
      segments.length !== 2 ||
      segments[0] !== "authority"
    ) {
      fail(
        `AUTHORITY route must be /authority/{slug}/: ${route}`
      );
    }
  }

  return route;
}

function validateNormalizedLgdRows(
  rows
) {
  if (
    !Array.isArray(rows)
  ) {
    fail(
      "LGD normalized input must be an array"
    );
  }

  const sourceKeys =
    new Set();

  const routes =
    new Set();

  const stateSlugs =
    new Set();

  const normalized =
    rows.map(
      (
        raw,
        index
      ) => {
        const row =
          assertObject(
            raw,
            `LGD row[${index}]`
          );

        const sourceSystem =
          assertString(
            row.sourceSystem ||
              "LGD",
            "sourceSystem",
            32
          );

        if (
          sourceSystem !==
          "LGD"
        ) {
          fail(
            `LGD row[${index}] must have sourceSystem=LGD`
          );
        }

        const locationType =
          assertType(
            row.locationType
          );

        const sourceCode =
          assertSourceCode(
            row.sourceCode
          );

        const canonicalName =
          assertString(
            row.canonicalName,
            "canonicalName",
            MAX_NAME_LENGTH
          );

        const canonicalSlug =
          assertSlug(
            row.canonicalSlug
          );

        const currentRoute =
          assertRoute(
            row.currentRoute
          );

        assertRouteShape(
          locationType,
          currentRoute
        );

        const parentSourceCode =
          assertParentSourceCode(
            row.parentSourceCode
          );

        const sourceKey =
          `${locationType}:${sourceCode}`;

        if (
          sourceKeys.has(
            sourceKey
          )
        ) {
          fail(
            `Duplicate LGD source identity: ${sourceKey}`
          );
        }

        if (
          routes.has(
            currentRoute
          )
        ) {
          fail(
            `Duplicate current route: ${currentRoute}`
          );
        }

        /*
         * State slugs must be unique.
         * Other typed namespaces may safely reuse a slug.
         */
        if (
          locationType ===
            "STATE" &&
          stateSlugs.has(
            canonicalSlug
          )
        ) {
          fail(
            `Duplicate STATE slug: ${canonicalSlug}`
          );
        }

        sourceKeys.add(
          sourceKey
        );

        routes.add(
          currentRoute
        );

        if (
          locationType ===
          "STATE"
        ) {
          stateSlugs.add(
            canonicalSlug
          );
        }

        return Object.freeze({
          sourceSystem,
          locationType,
          sourceCode,
          parentSourceCode,
          canonicalName,
          canonicalSlug,
          currentRoute
        });
      }
    );

  return Object.freeze(
    normalized
  );
}

function buildDryRunReport(
  rows
) {
  const normalized =
    validateNormalizedLgdRows(
      rows
    );

  const byType = {};

  for (
    const type of ALLOWED_TYPES
  ) {
    byType[type] =
      normalized.filter(
        row =>
          row.locationType ===
          type
      ).length;
  }

  return Object.freeze({
    status: "PASS",
    sourceSystem: "LGD",
    total:
      normalized.length,
    byType,
    sourceCodes:
      normalized.map(
        row =>
          row.sourceCode
      ),
    routes:
      normalized.map(
        row =>
          row.currentRoute
      )
  });
}

module.exports = {
  ALLOWED_TYPES,
  assertSourceCode,
  assertSlug,
  assertRoute,
  assertRouteShape,
  validateNormalizedLgdRows,
  buildDryRunReport
};
