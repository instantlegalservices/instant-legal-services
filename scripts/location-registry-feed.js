/**
 * Instant Legal Services
 * Location Registry SEO Feed Client + Validator
 *
 * Purpose:
 * - Fetch the read-only Location Registry SEO feed.
 * - Validate current location routes.
 * - Validate historical route redirects.
 * - Validate current-vs-historical feed consistency.
 * - Fail closed on malformed or conflicting data.
 *
 * This module is intentionally independent from:
 *   scripts/generate-seo-pages.js
 *
 * Security:
 * - Supabase credentials are read only from environment variables.
 * - Credentials are never returned by this module.
 * - Supabase access requires HTTPS.
 * - This module is intended for trusted server/CI execution only.
 */

"use strict";

const ALLOWED_LOCATION_TYPES =
  new Set([
    "STATE",
    "DISTRICT",
    "TEHSIL",
    "LOCAL_BODY",
    "AUTHORITY"
  ]);

/**
 * Assert a non-empty string.
 */
function assertNonEmptyString(
  value,
  field
) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${field} must be a non-empty string`
    );
  }

  return value.trim();
}

/**
 * Assert a canonical route.
 *
 * This feed module intentionally validates the
 * Registry's route shape without imposing the
 * location-type namespace rules owned by the
 * dedicated sitemap validator.
 */
function assertCanonicalRoute(
  value,
  field
) {
  if (
    typeof value !== "string"
  ) {
    throw new Error(
      `${field} must be a string`
    );
  }

  if (
    !value.trim()
  ) {
    throw new Error(
      `${field} must be a non-empty string`
    );
  }

  /*
   * Do not silently normalize route whitespace.
   * Fail closed instead.
   */
  if (
    value !== value.trim()
  ) {
    throw new Error(
      `${field} must not contain leading or trailing whitespace`
    );
  }

  const route =
    value;

  if (
    !route.startsWith("/") ||
    !route.endsWith("/")
  ) {
    throw new Error(
      `${field} is not a canonical route: ${route}`
    );
  }

  /*
   * Reject route characters that could make the
   * feed ambiguous or unsafe for downstream
   * sitemap/redirect processing.
   */
  if (
    /[\u0000-\u001F\u007F]/.test(route)
  ) {
    throw new Error(
      `${field} must not contain control characters`
    );
  }

  if (
    route.includes("\\")
  ) {
    throw new Error(
      `${field} must not contain backslashes`
    );
  }

  if (
    route.includes("?") ||
    route.includes("#")
  ) {
    throw new Error(
      `${field} must not contain query strings or fragments`
    );
  }

  if (
    route.includes("//")
  ) {
    throw new Error(
      `${field} must not contain duplicate slashes`
    );
  }

  /*
   * Dot segments are not canonical routes.
   */
  const segments =
    route.split("/");

  if (
    segments.includes(".") ||
    segments.includes("..")
  ) {
    throw new Error(
      `${field} must not contain dot segments`
    );
  }

  return route;
}

/**
 * Validate current Location Registry SEO feed.
 *
 * Expected RPC:
 * public.get_location_seo_feed()
 *
 * Expected fields:
 * - id
 * - location_type
 * - canonical_name
 * - canonical_slug
 * - current_route
 */
function validateCurrentFeed(
  rows
) {
  if (
    !Array.isArray(rows)
  ) {
    throw new Error(
      "Location Registry SEO feed must be an array"
    );
  }

  const locationIds =
    new Set();

  const routes =
    new Set();

  return rows.map(
    (row, index) => {
      if (
        !row ||
        typeof row !== "object" ||
        Array.isArray(row)
      ) {
        throw new Error(
          `Invalid Location Registry row at index ${index}`
        );
      }

      const id =
        assertNonEmptyString(
          row.id,
          "id"
        );

      const locationType =
        assertNonEmptyString(
          row.location_type,
          "location_type"
        );

      const canonicalName =
        assertNonEmptyString(
          row.canonical_name,
          "canonical_name"
        );

      const canonicalSlug =
        assertNonEmptyString(
          row.canonical_slug,
          "canonical_slug"
        );

      const currentRoute =
        assertCanonicalRoute(
          row.current_route,
          "current_route"
        );

      if (
        !ALLOWED_LOCATION_TYPES.has(
          locationType
        )
      ) {
        throw new Error(
          `Unsupported location_type: ${locationType}`
        );
      }

      if (
        locationIds.has(id)
      ) {
        throw new Error(
          `Duplicate location id: ${id}`
        );
      }

      if (
        routes.has(currentRoute)
      ) {
        throw new Error(
          `Duplicate current route: ${currentRoute}`
        );
      }

      if (
        canonicalSlug !==
        canonicalSlug.toLowerCase()
      ) {
        throw new Error(
          `canonical_slug must be lowercase: ${canonicalSlug}`
        );
      }

      locationIds.add(id);
      routes.add(currentRoute);

      return {
        id,
        location_type:
          locationType,
        canonical_name:
          canonicalName,
        canonical_slug:
          canonicalSlug,
        current_route:
          currentRoute
      };
    }
  );
}

/**
 * Validate historical route redirect feed.
 *
 * Expected RPC:
 * public.get_location_redirect_feed()
 *
 * Expected fields:
 * - location_id
 * - route
 * - redirect_to
 *
 * Invariants:
 * - Historical route must be unique.
 * - Historical route cannot redirect to itself.
 * - If the location currently exists, redirect_to
 *   must equal that location's exact current route.
 */
function validateRedirectFeed(
  rows,
  currentRows
) {
  if (
    !Array.isArray(rows)
  ) {
    throw new Error(
      "Location Registry redirect feed must be an array"
    );
  }

  if (
    !Array.isArray(currentRows)
  ) {
    throw new Error(
      "currentRows must be an array"
    );
  }

  const currentByLocationId =
    new Map(
      currentRows.map(
        row => [
          row.id,
          row.current_route
        ]
      )
    );

  const historicalRoutes =
    new Set();

  return rows.map(
    (row, index) => {
      if (
        !row ||
        typeof row !== "object" ||
        Array.isArray(row)
      ) {
        throw new Error(
          `Invalid redirect row at index ${index}`
        );
      }

      const locationId =
        assertNonEmptyString(
          row.location_id,
          "location_id"
        );

      const route =
        assertCanonicalRoute(
          row.route,
          "route"
        );

      const redirectTo =
        assertCanonicalRoute(
          row.redirect_to,
          "redirect_to"
        );

      if (
        route === redirectTo
      ) {
        throw new Error(
          `Historical route cannot redirect to itself: ${route}`
        );
      }

      if (
        historicalRoutes.has(route)
      ) {
        throw new Error(
          `Duplicate historical route: ${route}`
        );
      }

      historicalRoutes.add(route);

      /*
       * If the location is present in the current feed,
       * its historical route must redirect to its exact
       * current route.
       */
      if (
        currentByLocationId.has(
          locationId
        )
      ) {
        const currentRoute =
          currentByLocationId.get(
            locationId
          );

        if (
          currentRoute !==
          redirectTo
        ) {
          throw new Error(
            `Redirect target does not match current route for location ${locationId}`
          );
        }
      }

      return {
        location_id:
          locationId,
        route,
        redirect_to:
          redirectTo
      };
    }
  );
}

/**
 * Validate consistency between the current and
 * historical Location Registry feeds.
 *
 * This is deliberately separate from
 * validateRedirectFeed().
 *
 * Reason:
 * - validateRedirectFeed() validates the redirect feed
 *   relative to location ownership.
 * - this function validates the relationship between
 *   the two independently validated feeds.
 *
 * Critical invariant:
 * A historical route must NEVER also be a current
 * published route.
 */
function validateFeedConsistency(
  currentRows,
  redirectRows
) {
  if (
    !Array.isArray(currentRows)
  ) {
    throw new Error(
      "currentRows must be an array"
    );
  }

  if (
    !Array.isArray(redirectRows)
  ) {
    throw new Error(
      "redirectRows must be an array"
    );
  }

  const currentRoutes =
    new Set(
      currentRows.map(
        row =>
          row.current_route
      )
    );

  for (
    const redirect of redirectRows
  ) {
    if (
      !redirect ||
      typeof redirect !== "object" ||
      Array.isArray(redirect)
    ) {
      throw new Error(
        "Invalid redirect entry during feed consistency validation"
      );
    }

    const historicalRoute =
      redirect.route;

    if (
      typeof historicalRoute !==
      "string"
    ) {
      throw new Error(
        "Redirect route must be a string during feed consistency validation"
      );
    }

    if (
      currentRoutes.has(
        historicalRoute
      )
    ) {
      throw new Error(
        `Historical route is also a current route: ${historicalRoute}`
      );
    }
  }

  return true;
}

/**
 * Call a Supabase RPC.
 *
 * The request is made directly against the
 * Supabase PostgREST RPC endpoint.
 */
async function callRpc(
  supabaseUrl,
  serviceRoleKey,
  functionName
) {
  const baseUrl =
    supabaseUrl.replace(
      /\/+$/,
      ""
    );

  const endpoint =
    `${baseUrl}/rest/v1/rpc/${functionName}`;

  const response =
    await fetch(
      endpoint,
      {
        method:
          "POST",

        headers: {
          apikey:
            serviceRoleKey,

          Authorization:
            `Bearer ${serviceRoleKey}`,

          "Content-Type":
            "application/json",

          Accept:
            "application/json"
        },

        body:
          "{}"
      }
    );

  if (
    !response.ok
  ) {
    const errorText =
      await response.text();

    throw new Error(
      `${functionName} failed: ` +
      `HTTP ${response.status} ` +
      `${response.statusText} - ` +
      `${errorText.slice(0, 500)}`
    );
  }

  return response.json();
}

/**
 * Load and validate both Location Registry feeds.
 *
 * Required environment variables:
 *
 * LOCATION_REGISTRY_SUPABASE_URL
 * LOCATION_REGISTRY_SUPABASE_SERVICE_ROLE_KEY
 *
 * NOTE:
 * The existing environment-variable contract is
 * intentionally preserved for this migration phase.
 */
async function loadLocationFeeds() {
  const supabaseUrl =
    String(
      process.env
        .LOCATION_REGISTRY_SUPABASE_URL ||
        ""
    ).trim();

  const serviceRoleKey =
    String(
      process.env
        .LOCATION_REGISTRY_SUPABASE_SERVICE_ROLE_KEY ||
        ""
    ).trim();

  if (
    !supabaseUrl
  ) {
    throw new Error(
      "LOCATION_REGISTRY_SUPABASE_URL is missing"
    );
  }

  if (
    !serviceRoleKey
  ) {
    throw new Error(
      "LOCATION_REGISTRY_SUPABASE_SERVICE_ROLE_KEY is missing"
    );
  }

  let parsedUrl;

  try {
    parsedUrl =
      new URL(
        supabaseUrl
      );
  } catch {
    throw new Error(
      "LOCATION_REGISTRY_SUPABASE_URL is not a valid URL"
    );
  }

  /*
   * Credentials must never be sent over
   * plain HTTP.
   */
  if (
    parsedUrl.protocol !==
    "https:"
  ) {
    throw new Error(
      "LOCATION_REGISTRY_SUPABASE_URL must use HTTPS"
    );
  }

  const currentRaw =
    await callRpc(
      supabaseUrl,
      serviceRoleKey,
      "get_location_seo_feed"
    );

  const currentRows =
    validateCurrentFeed(
      currentRaw
    );

  const redirectRaw =
    await callRpc(
      supabaseUrl,
      serviceRoleKey,
      "get_location_redirect_feed"
    );

  const redirectRows =
    validateRedirectFeed(
      redirectRaw,
      currentRows
    );

  /*
   * Cross-feed consistency is a separate
   * explicit validation boundary.
   */
  validateFeedConsistency(
    currentRows,
    redirectRows
  );

  return {
    currentRows,
    redirectRows
  };
}

module.exports = {
  ALLOWED_LOCATION_TYPES,
  validateCurrentFeed,
  validateRedirectFeed,
  validateFeedConsistency,
  loadLocationFeeds
};

/**
 * Standalone execution.
 *
 * Useful for CI validation:
 *
 * node scripts/location-registry-feed.js
 */
if (
  require.main === module
) {
  loadLocationFeeds()
    .then(
      ({
        currentRows,
        redirectRows
      }) => {
        console.log(
          `Validated registry locations: ${currentRows.length}`
        );

        console.log(
          `Validated historical redirects: ${redirectRows.length}`
        );

        console.log(
          "LOCATION_REGISTRY_FEED_VALIDATION=PASS"
        );
      }
    )
    .catch(
      error => {
        console.error(
          "LOCATION_REGISTRY_FEED_VALIDATION=FAIL"
        );

        console.error(
          error.message
        );

        process.exitCode = 1;
      }
    );
}
