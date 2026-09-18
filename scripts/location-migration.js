/**
 * Instant Legal Services
 * Location Route Migration Engine
 *
 * Purpose
 * -------
 * Safely migrate legacy location routes to the new hierarchical
 * location route system.
 *
 * HARD SAFETY RULES
 * -----------------
 * 1. Stable sourceId is the identity of a location.
 * 2. A sourceId may own only one current route.
 * 3. A current route may belong to only one sourceId.
 * 4. Historical routes are preserved in previousRoutes.
 * 5. Historical routes are NEVER emitted into the sitemap.
 * 6. Every migrated historical route produces REDIRECT-REQUIRED.
 * 7. Redirects always point directly to the final current route.
 * 8. canonical MUST equal route.
 * 9. No database writes.
 * 10. No existing sitemap.xml modification.
 * 11. No file deletion.
 * 12. Migration is deterministic.
 * 13. Rollback restores the exact previous manifest.
 * 14. Any ownership collision fails closed.
 *
 * Expected manifest location
 * --------------------------
 * The engine accepts a manifest object directly.
 * File I/O is deliberately kept outside the core migration function.
 *
 * This allows:
 *   - unit testing
 *   - dry runs
 *   - CI validation
 *   - future integration with the Location Registry
 *
 * Route examples
 * --------------
 *
 * Legacy:
 *   /bareilly/
 *   /bareilly/court/
 *
 * New:
 *   /uttar-pradesh/bareilly/
 *   /uttar-pradesh/bareilly/district-court/
 *
 * IMPORTANT
 * ---------
 * This engine does NOT guess a new route from a name.
 * The caller must supply the validated target route.
 */

"use strict";

const crypto = require("crypto");

const SITE_URL = "https://instantlegalservices.in";
const CANONICAL_HOST = "instantlegalservices.in";

const MAX_ROUTE_LENGTH = 2048;
const MAX_URLS = 50000;
const MAX_SITEMAP_BYTES = 52_428_800;

const REDIRECT_STATUS = "REDIRECT-REQUIRED";
const CURRENT_STATUS = "CURRENT";
const ACTIVE_STATUS = "ACTIVE";

/**
 * Supported location types.
 */
const ALLOWED_LOCATION_TYPES = new Set([
  "STATE",
  "DISTRICT",
  "TEHSIL",
  "LOCAL_BODY",
  "AUTHORITY",
  "COURT"
]);

/**
 * New typed route namespaces.
 *
 * DISTRICT is intentionally hierarchical:
 *
 *   /{state}/{district}/
 *
 * Court is:
 *
 *   /{state}/{district}/{court}/
 *
 * Tehsil / local body / authority remain typed namespaces.
 */
const TYPED_PREFIXES = Object.freeze({
  TEHSIL: "/tehsil/",
  LOCAL_BODY: "/local-body/",
  AUTHORITY: "/authority/"
});

/**
 * ---------- BASIC VALIDATION ----------
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

function assertArray(value, field) {
  if (!Array.isArray(value)) {
    fail(`${field} must be an array`);
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

  return value.trim();
}

function assertLowercaseSlug(value, field) {
  const slug =
    assertNonEmptyString(
      value,
      field
    );

  if (
    slug !==
    slug.toLowerCase()
  ) {
    fail(
      `${field} must be lowercase: ${slug}`
    );
  }

  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  ) {
    fail(
      `${field} is not a valid slug: ${slug}`
    );
  }

  return slug;
}

function assertSourceId(value) {
  const sourceId =
    assertNonEmptyString(
      value,
      "sourceId"
    );

  /*
   * UUID is preferred because the Location Registry
   * already treats registry ID as stable identity.
   *
   * We intentionally do not require UUID here because
   * migration manifests may contain existing stable IDs.
   */
  if (
    sourceId.length > 200
  ) {
    fail(
      "sourceId exceeds maximum length"
    );
  }

  return sourceId;
}

function assertLocationType(value) {
  const type =
    assertNonEmptyString(
      value,
      "locationType"
    );

  if (
    !ALLOWED_LOCATION_TYPES.has(type)
  ) {
    fail(
      `Unsupported locationType: ${type}`
    );
  }

  return type;
}

/**
 * ---------- ROUTE VALIDATION ----------
 */

function assertRoute(value, field = "route") {
  if (typeof value === "string") {
    if (value !== value.trim()) {
      fail(
        `${field} must not contain leading or trailing whitespace`
      );
    }
  }

  const route =
    assertNonEmptyString(
      value,
      field
    );
  
  if (
    !route.startsWith("/")
  ) {
    fail(
      `${field} must start with /: ${route}`
    );
  }

  if (
    !route.endsWith("/")
  ) {
    fail(
      `${field} must end with /: ${route}`
    );
  }

  if (
    route.length > MAX_ROUTE_LENGTH
  ) {
    fail(
      `${field} exceeds maximum route length`
    );
  }

  /*
   * No control characters.
   */
  if (
    /[\u0000-\u001F\u007F]/.test(route)
  ) {
    fail(
      `${field} contains control characters`
    );
  }

  /*
   * Backslashes are forbidden.
   */
  if (
    route.includes("\\")
  ) {
    fail(
      `${field} must not contain backslashes`
    );
  }

  /*
   * Query strings and fragments do not belong
   * in canonical location routes.
   */
  if (
    route.includes("?") ||
    route.includes("#")
  ) {
    fail(
      `${field} must not contain query strings or fragments`
    );
  }

  /*
   * Reject dot segments.
   */
  const segments =
    route.split("/");

  for (const segment of segments) {
    if (
      segment === "." ||
      segment === ".."
    ) {
      fail(
        `${field} must not contain dot-segments`
      );
    }
  }

  /*
   * Reject duplicate slashes.
   */
  if (
    route.includes("//")
  ) {
    fail(
      `${field} contains duplicate slashes`
    );
  }

  /*
   * Ensure URL is on the canonical ILS origin.
   */
  let url;

  try {
    url =
      new URL(
        route,
        SITE_URL
      );
  } catch {
    fail(
      `${field} is not a valid URL path: ${route}`
    );
  }

  if (
    url.protocol !== "https:"
  ) {
    fail(
      `${field} must resolve to HTTPS`
    );
  }

  if (
    url.hostname !== CANONICAL_HOST
  ) {
    fail(
      `${field} resolves to an invalid hostname`
    );
  }

  if (
    url.pathname !== route
  ) {
    fail(
      `${field} changes during URL normalization`
    );
  }

  if (
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    fail(
      `${field} contains forbidden URL components`
    );
  }

  return route;
}

/**
 * ---------- LOCATION TYPE ↔ ROUTE VALIDATION ----------
 *
 * Validates the namespace of a NEW migration route
 * against the declared locationType.
 *
 * Legacy/current routes are not reinterpreted here.
 * This validation applies to migration target routes.
 */

function assertRouteMatchesLocationType(
  locationType,
  route,
  field = "route"
) {
  const type =
    assertLocationType(
      locationType
    );

  const safeRoute =
    assertRoute(
      route,
      field
    );

  const typedNamespaces = [
    TYPED_PREFIXES.TEHSIL,
    TYPED_PREFIXES.LOCAL_BODY,
    TYPED_PREFIXES.AUTHORITY
  ];

  /*
   * TEHSIL must use the tehsil namespace.
   */
  if (
    type === "TEHSIL" &&
    !safeRoute.startsWith(
      TYPED_PREFIXES.TEHSIL
    )
  ) {
    fail(
      `${field} is incompatible with TEHSIL locationType: ${safeRoute}`
    );
  }

  /*
   * LOCAL_BODY must use the local-body namespace.
   */
  if (
    type === "LOCAL_BODY" &&
    !safeRoute.startsWith(
      TYPED_PREFIXES.LOCAL_BODY
    )
  ) {
    fail(
      `${field} is incompatible with LOCAL_BODY locationType: ${safeRoute}`
    );
  }

  /*
   * AUTHORITY must use the authority namespace.
   */
  if (
    type === "AUTHORITY" &&
    !safeRoute.startsWith(
      TYPED_PREFIXES.AUTHORITY
    )
  ) {
    fail(
      `${field} is incompatible with AUTHORITY locationType: ${safeRoute}`
    );
  }

  /*
   * DISTRICT must not use a typed namespace reserved
   * for another location type.
   *
   * Valid district routes remain hierarchical, e.g.
   * /uttar-pradesh/bareilly/
   */
  if (
    type === "DISTRICT"
  ) {
    for (
      const namespace
      of typedNamespaces
    ) {
      if (
        safeRoute.startsWith(
          namespace
        )
      ) {
        fail(
          `${field} is incompatible with DISTRICT locationType: ${safeRoute}`
        );
      }
    }
  }

  /*
   * COURT routes are hierarchical and must not use
   * namespaces reserved for TEHSIL / LOCAL_BODY /
   * AUTHORITY.
   */
  if (
    type === "COURT"
  ) {
    for (
      const namespace
      of typedNamespaces
    ) {
      if (
        safeRoute.startsWith(
          namespace
        )
      ) {
        fail(
          `${field} is incompatible with COURT locationType: ${safeRoute}`
        );
      }
    }
  }

  return safeRoute;
}
/**
 * ---------- CANONICAL VALIDATION ----------
 */

function assertCanonicalEqualsRoute(
  route,
  canonical
) {
  const safeRoute =
    assertRoute(
      route,
      "route"
    );

  const safeCanonical =
    assertRoute(
      canonical,
      "canonical"
    );

  if (
    safeCanonical !==
    safeRoute
  ) {
    fail(
      `canonical must equal route: ${safeCanonical} != ${safeRoute}`
    );
  }

  return safeRoute;
}

/**
 * ---------- ROUTE NORMALIZATION ----------
 */

function normalizeRoute(route) {
  return assertRoute(
    route,
    "route"
  );
}

function normalizePreviousRoutes(
  routes,
  currentRoute
) {
  if (
    routes === undefined ||
    routes === null
  ) {
    return [];
  }

  assertArray(
    routes,
    "previousRoutes"
  );

  const unique = new Set();

  for (const route of routes) {
    const normalized =
      normalizeRoute(
        route
      );

    /*
     * Current route can NEVER appear in
     * previousRoutes.
     */
    if (
      normalized ===
      currentRoute
    ) {
      fail(
        `previousRoutes contains current route: ${currentRoute}`
      );
    }

    unique.add(
      normalized
    );
  }

  return [
    ...unique
  ].sort();
}

/**
 * ---------- CONTENT HASH ----------
 *
 * The hash intentionally excludes:
 * - generatedAt
 * - migration timestamp
 * - runtime environment
 *
 * Therefore the same logical page produces
 * the same hash.
 */

function calculateContentHash(
  entry
) {
  assertObject(
    entry,
    "entry"
  );

  const hashPayload = {
    sourceId:
      assertSourceId(
        entry.sourceId
      ),

    locationType:
      assertLocationType(
        entry.locationType
      ),

    route:
      assertRoute(
        entry.route
      ),

    canonical:
      assertCanonicalEqualsRoute(
        entry.route,
        entry.canonical
      ),

    previousRoutes:
      normalizePreviousRoutes(
        entry.previousRoutes,
        entry.route
      )
  };

  const canonicalJson =
    JSON.stringify(
      hashPayload
    );

  return crypto
    .createHash("sha256")
    .update(
      canonicalJson,
      "utf8"
    )
    .digest("hex");
}

/**
 * ---------- MANIFEST ENTRY ----------
 */

function normalizeManifestEntry(
  raw
) {
  assertObject(
    raw,
    "manifest entry"
  );

  const sourceId =
    assertSourceId(
      raw.sourceId
    );

  const locationType =
    assertLocationType(
      raw.locationType
    );

  const route =
    assertRoute(
      raw.route
    );

  const canonical =
    assertCanonicalEqualsRoute(
      route,
      raw.canonical
    );

  const previousRoutes =
    normalizePreviousRoutes(
      raw.previousRoutes,
      route
    );

  const status =
  raw.status === undefined
    ? ACTIVE_STATUS
    : assertNonEmptyString(
        raw.status,
        "status"
      );

if (
  status !== ACTIVE_STATUS
) {
  fail(
    `Unsupported manifest status: ${status}`
  );
}

  const generatorVersion =
    raw.generatorVersion === undefined
      ? "location-migration-v1"
      : assertNonEmptyString(
          raw.generatorVersion,
          "generatorVersion"
        );

    /*
   * Content-hash integrity is strict.
   *
   * We ALWAYS calculate the expected hash from the
   * canonical manifest payload.
   *
   * If a contentHash was supplied by the caller,
   * it MUST exactly match the calculated value.
   */
  const calculatedContentHash =
    calculateContentHash({
      sourceId,
      locationType,
      route,
      canonical,
      previousRoutes
    });

  const hasSuppliedContentHash =
    Object.prototype.hasOwnProperty.call(
      raw,
      "contentHash"
    );

  if (hasSuppliedContentHash) {
    if (
      typeof raw.contentHash !== "string" ||
      !/^[a-f0-9]{64}$/i.test(
        raw.contentHash
      )
    ) {
      fail(
        `Invalid contentHash for ${sourceId}`
      );
    }

    if (
      raw.contentHash.toLowerCase() !==
      calculatedContentHash
    ) {
      fail(
        `contentHash integrity mismatch for ${sourceId}`
      );
    }
  }

  const contentHash =
    calculatedContentHash;
  return {
    sourceId,
    locationType,
    route,
    canonical,
    previousRoutes,
    status,
    contentHash:
      contentHash.toLowerCase(),
    generatorVersion
  };
}

/**
 * ---------- MANIFEST INDEX ----------
 */

function buildManifestIndex(
  entries,
  label = "manifest"
) {
  assertArray(
    entries,
    label
  );

  const bySourceId =
    new Map();

  const byRoute =
    new Map();

  const byHistoricalRoute =
    new Map();

  for (
    let index = 0;
    index < entries.length;
    index++
  ) {
    const entry =
      normalizeManifestEntry(
        entries[index]
      );

    if (
      bySourceId.has(
        entry.sourceId
      )
    ) {
      fail(
        `Duplicate sourceId in ${label}: ${entry.sourceId}`
      );
    }

    if (
      byRoute.has(
        entry.route
      )
    ) {
      const owner =
        byRoute.get(
          entry.route
        );

      fail(
        `Current route ownership collision: ` +
        `${entry.route} belongs to ` +
        `${owner.sourceId} and ${entry.sourceId}`
      );
    }

    bySourceId.set(
      entry.sourceId,
      entry
    );

    byRoute.set(
      entry.route,
      entry
    );

    for (
      const historicalRoute
      of entry.previousRoutes
    ) {
      if (
        byHistoricalRoute.has(
          historicalRoute
        )
      ) {
        const owner =
          byHistoricalRoute.get(
            historicalRoute
          );

        fail(
          `Historical route ownership collision: ` +
          `${historicalRoute} belongs to ` +
          `${owner.sourceId} and ${entry.sourceId}`
        );
      }

      byHistoricalRoute.set(
        historicalRoute,
        entry
      );
    }
  }

  /*
   * A historical route can never simultaneously
   * be a current route.
   */
  for (
    const [
      historicalRoute,
      owner
    ]
    of byHistoricalRoute
  ) {
    if (
      byRoute.has(
        historicalRoute
      )
    ) {
      const currentOwner =
        byRoute.get(
          historicalRoute
        );

      fail(
        `Historical/current route collision: ` +
        `${historicalRoute} is historical for ` +
        `${owner.sourceId} but current for ` +
        `${currentOwner.sourceId}`
      );
    }
  }

  return {
    bySourceId,
    byRoute,
    byHistoricalRoute
  };
}

/**
 * ---------- MIGRATION INPUT ----------
 *
 * Each migration item MUST identify the stable sourceId.
 *
 * Example:
 *
 * {
 *   sourceId: "location-uuid",
 *   locationType: "DISTRICT",
 *   newRoute: "/uttar-pradesh/bareilly/",
 *   canonical: "/uttar-pradesh/bareilly/"
 * }
 *
 * No route is inferred automatically.
 */

function normalizeMigrationItem(
  raw
) {
  assertObject(
    raw,
    "migration item"
  );

  const sourceId =
    assertSourceId(
      raw.sourceId
    );

  const locationType =
    assertLocationType(
      raw.locationType
    );

 const newRoute =
  assertRouteMatchesLocationType(
    locationType,
    raw.newRoute,
    "newRoute"
  );

  const canonical =
    raw.canonical === undefined
      ? newRoute
      : assertCanonicalEqualsRoute(
          newRoute,
          raw.canonical
        );

  return {
    sourceId,
    locationType,
    newRoute,
    canonical
  };
}

/**
 * ---------- REDIRECT RECORD ----------
 */

function createRedirectRecord(
  sourceId,
  locationType,
  fromRoute,
  toRoute
) {
  const from =
    assertRoute(
      fromRoute,
      "redirect.from"
    );

  const to =
    assertRoute(
      toRoute,
      "redirect.to"
    );

  if (
    from === to
  ) {
    fail(
      `Redirect cannot point to itself: ${from}`
    );
  }

  return {
    sourceId,
    locationType,
    from,
    to,
    status:
      REDIRECT_STATUS
  };
}

/**
 * ---------- MIGRATION ----------
 */

function migrateLocations(
  currentManifest,
  migrationItems,
  options = {}
) {
  assertObject(
  options,
  "options"
);

const hasGeneratorVersion =
  Object.prototype.hasOwnProperty.call(
    options,
    "generatorVersion"
  );

const generatorVersion =
  hasGeneratorVersion
    ? assertNonEmptyString(
        options.generatorVersion,
        "options.generatorVersion"
      )
    : "location-migration-v1";
  const currentEntries =
    assertArray(
      currentManifest,
      "currentManifest"
    );

  const requestedMigrations =
    assertArray(
      migrationItems,
      "migrationItems"
    );

  /*
   * First validate the entire current manifest.
   *
   * Fail before changing anything.
   */
  const currentIndex =
    buildManifestIndex(
      currentEntries,
      "currentManifest"
    );

  /*
   * Normalize every migration item before
   * modifying any state.
   */
  const migrations =
    requestedMigrations.map(
      normalizeMigrationItem
    );

  /*
   * A sourceId may occur only once in one migration batch.
   */
  const migrationSourceIds =
    new Set();

  for (
    const migration
    of migrations
  ) {
    if (
      migrationSourceIds.has(
        migration.sourceId
      )
    ) {
      fail(
        `Duplicate migration sourceId: ${migration.sourceId}`
      );
    }

    migrationSourceIds.add(
      migration.sourceId
    );
  }

  /*
   * Clone the complete manifest.
   *
   * Nothing is mutated in the original object.
   */
  const nextEntries =
    currentEntries.map(
      entry =>
        normalizeManifestEntry(
          entry
        )
    );

  const nextBySourceId =
    new Map(
      nextEntries.map(
        entry => [
          entry.sourceId,
          entry
        ]
      )
    );

  const redirectRecords =
    [];

  /*
   * Preflight target route ownership.
   *
   * This is done BEFORE applying any migration.
   */
  const reservedTargets =
    new Map();

  for (
    const migration
    of migrations
  ) {
    const existingOwner =
      currentIndex.byRoute.get(
        migration.newRoute
      );

    if (
      existingOwner &&
      existingOwner.sourceId !==
        migration.sourceId
    ) {
      fail(
        `Target route already owned by another location: ` +
        `${migration.newRoute} -> ${existingOwner.sourceId}`
      );
    }

    if (
      reservedTargets.has(
        migration.newRoute
      ) &&
      reservedTargets.get(
        migration.newRoute
      ) !==
        migration.sourceId
    ) {
      fail(
        `Two migrations target the same route: ${migration.newRoute}`
      );
    }

    reservedTargets.set(
      migration.newRoute,
      migration.sourceId
    );
  }

  /*
   * Apply each migration to the in-memory copy.
   */
  for (
    const migration
    of migrations
  ) {
    const existing =
      nextBySourceId.get(
        migration.sourceId
      );

    if (!existing) {
      fail(
        `Cannot migrate unknown sourceId: ${migration.sourceId}`
      );
    }

    /*
     * Location type is identity metadata.
     * A migration must not silently change it.
     */
    if (
      existing.locationType !==
      migration.locationType
    ) {
      fail(
        `locationType change requires explicit ownership migration: ` +
        `${migration.sourceId} ` +
        `${existing.locationType} -> ` +
        `${migration.locationType}`
      );
    }

    const oldRoute =
      existing.route;

    const newRoute =
      migration.newRoute;

    /*
     * No-op migration.
     */
    if (
      oldRoute ===
      newRoute
    ) {
      const recalculatedHash =
        calculateContentHash({
          sourceId:
            existing.sourceId,
          locationType:
            existing.locationType,
          route:
            existing.route,
          canonical:
            migration.canonical,
          previousRoutes:
            existing.previousRoutes
        });

      existing.canonical =
        migration.canonical;

      existing.contentHash =
        recalculatedHash;

      existing.generatorVersion =
        generatorVersion;

      continue;
    }

    /*
     * Never allow a target route to be one of
     * the location's own historical routes.
     *
     * That would create a route resurrection.
     */
    if (
      existing.previousRoutes.includes(
        newRoute
      )
    ) {
      fail(
        `Target route is already historical for ${migration.sourceId}: ${newRoute}`
      );
    }

    /*
     * Never allow target to be a historical route
     * of another owner.
     */
    const historicalOwner =
      currentIndex.byHistoricalRoute.get(
        newRoute
      );

    if (
      historicalOwner &&
      historicalOwner.sourceId !==
        migration.sourceId
    ) {
      fail(
        `Target route is historical for another location: ` +
        `${newRoute} -> ${historicalOwner.sourceId}`
      );
    }

    /*
     * Preserve the old current route.
     */
    const previousRoutes =
      new Set(
        existing.previousRoutes
      );

    previousRoutes.add(
      oldRoute
    );

    /*
     * New route must not appear in previousRoutes.
     */
    previousRoutes.delete(
      newRoute
    );

    const normalizedPreviousRoutes =
      [
        ...previousRoutes
      ].sort();

    const migratedEntry = {
      sourceId:
        existing.sourceId,

      locationType:
        existing.locationType,

      route:
        newRoute,

      canonical:
        migration.canonical,

      previousRoutes:
        normalizedPreviousRoutes,

      status:
        ACTIVE_STATUS,

      contentHash:
        "",

      generatorVersion
    };

    migratedEntry.contentHash =
      calculateContentHash(
        migratedEntry
      );

    nextBySourceId.set(
      migration.sourceId,
      migratedEntry
    );

    redirectRecords.push(
      createRedirectRecord(
        migration.sourceId,
        migration.locationType,
        oldRoute,
        newRoute
      )
    );
  }

  /*
   * Rebuild the complete manifest from sourceId map.
   *
   * Sorting makes the result deterministic.
   */
  const finalEntries =
    [
      ...nextBySourceId.values()
    ]
      .map(
        normalizeManifestEntry
      )
      .sort(
        (a, b) =>
          a.sourceId.localeCompare(
            b.sourceId
          )
      );

  /*
   * Validate the COMPLETE resulting manifest.
   *
   * This catches collisions introduced by
   * the migration itself.
   */
  const finalIndex =
    buildManifestIndex(
      finalEntries,
      "migratedManifest"
    );

  /*
   * Validate redirect records against final ownership.
   */
  const redirects =
    redirectRecords
      .sort(
        (a, b) =>
          a.from.localeCompare(
            b.from
          )
      );

  const redirectFrom =
    new Set();

  for (
    const redirect
    of redirects
  ) {
    if (
      redirectFrom.has(
        redirect.from
      )
    ) {
      fail(
        `Duplicate redirect source: ${redirect.from}`
      );
    }

    redirectFrom.add(
      redirect.from
    );

    /*
     * A redirect source must NOT be a current route.
     */
    if (
      finalIndex.byRoute.has(
        redirect.from
      )
    ) {
      fail(
        `Redirect source is still a current route: ${redirect.from}`
      );
    }

    /*
     * Redirect must go directly to the final
     * current route.
     */
    const targetOwner =
      finalIndex.byRoute.get(
        redirect.to
      );

    if (!targetOwner) {
      fail(
        `Redirect target is not a current route: ${redirect.to}`
      );
    }

    if (
      targetOwner.sourceId !==
      redirect.sourceId
    ) {
      fail(
        `Redirect target ownership mismatch: ${redirect.from} -> ${redirect.to}`
      );
    }
  }

  /*
   * Sitemap candidates:
   * ONLY current routes.
   *
   * previousRoutes are deliberately excluded.
   */
  const sitemapRoutes =
    finalEntries
      .map(
        entry =>
          entry.route
      )
      .sort();

  /*
   * Ensure sitemap does not contain historical routes.
   */
  const historicalRoutes =
    new Set();

  for (
    const entry
    of finalEntries
  ) {
    for (
      const route
      of entry.previousRoutes
    ) {
      historicalRoutes.add(
        route
      );
    }
  }

  for (
    const route
    of sitemapRoutes
  ) {
    if (
      historicalRoutes.has(
        route
      )
    ) {
      fail(
        `Sitemap contains historical route: ${route}`
      );
    }
  }

  /*
   * Sitemap URL count safety.
   */
  if (
    sitemapRoutes.length >
    MAX_URLS
  ) {
    fail(
      `Sitemap exceeds ${MAX_URLS} URLs`
    );
  }

  /*
   * Approximate generated XML size.
   *
   * We don't generate sitemap.xml here.
   * We only provide a safety check for route volume.
   */
  const estimatedSitemapXml =
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...sitemapRoutes.map(
        route =>
          `  <url><loc>${SITE_URL}${route}</loc></url>`
      ),
      '</urlset>'
    ].join("\n");

  const sitemapBytes =
    Buffer.byteLength(
      estimatedSitemapXml,
      "utf8"
    );

  if (
    sitemapBytes >
    MAX_SITEMAP_BYTES
  ) {
    fail(
      `Estimated sitemap exceeds ${MAX_SITEMAP_BYTES} bytes`
    );
  }

  /*
   * Exact rollback snapshot.
   *
   * JSON serialization is deterministic because
   * finalEntries are already sorted and normalized.
   */
  const rollbackManifest =
    JSON.parse(
      JSON.stringify(
        currentEntries
          .map(
            normalizeManifestEntry
          )
          .sort(
            (a, b) =>
              a.sourceId.localeCompare(
                b.sourceId
              )
          )
      )
    );

  const rollbackHash =
    sha256Json(
      rollbackManifest
    );

  return {
    migratedManifest:
      finalEntries,

    redirects,

    sitemapRoutes,

    rollback: {
      manifest:
        rollbackManifest,

      sha256:
        rollbackHash
    },

    summary: {
      migrated:
        redirects.length,

      redirectsRequired:
        redirects.length,

      currentRoutes:
        sitemapRoutes.length,

      historicalRoutes:
        historicalRoutes.size,

      rollbackReady:
        true,

      status:
        "PASS"
    }
  };
}

/**
 * ---------- ROLLBACK ----------
 */

function rollbackMigration(
  rollbackSnapshot
) {
  assertObject(
    rollbackSnapshot,
    "rollbackSnapshot"
  );

  const manifest =
    assertArray(
      rollbackSnapshot.manifest,
      "rollbackSnapshot.manifest"
    );

  const normalized =
    manifest
      .map(
        normalizeManifestEntry
      )
      .sort(
        (a, b) =>
          a.sourceId.localeCompare(
            b.sourceId
          )
      );

  const expectedHash =
    assertNonEmptyString(
      rollbackSnapshot.sha256,
      "rollbackSnapshot.sha256"
    );

  const actualHash =
    sha256Json(
      normalized
    );

  if (
    actualHash !==
    expectedHash
  ) {
    fail(
      "Rollback snapshot integrity check failed"
    );
  }

  /*
   * Validate the rollback state before returning it.
   */
  buildManifestIndex(
    normalized,
    "rollbackManifest"
  );

  return {
    manifest:
      normalized,

    restored:
      true,

    sha256:
      actualHash,

    status:
      "ROLLBACK-PASS"
  };
}

/**
 * ---------- HASH HELPERS ----------
 */

function sha256Json(
  value
) {
  const json =
    JSON.stringify(
      value
    );

  return crypto
    .createHash("sha256")
    .update(
      json,
      "utf8"
    )
    .digest("hex");
}

/**
 * ---------- DETERMINISTIC SERIALIZATION ----------
 */

function serializeManifest(
  entries
) {
  const normalized =
    assertArray(
      entries,
      "entries"
    )
      .map(
        normalizeManifestEntry
      )
      .sort(
        (a, b) =>
          a.sourceId.localeCompare(
            b.sourceId
          )
      );

  /*
   * Validate before serialization.
   */
  buildManifestIndex(
    normalized,
    "serializedManifest"
  );

  return JSON.stringify(
    normalized,
    null,
    2
  ) + "\n";
}

/**
 * ---------- REDIRECT SERIALIZATION ----------
 *
 * This is NOT server configuration.
 * It produces a deterministic migration artifact
 * that can later be consumed by the actual redirect
 * implementation.
 */

function serializeRedirects(
  redirects
) {
  assertArray(
    redirects,
    "redirects"
  );

  const normalized =
    redirects
      .map(
        redirect => {
          assertObject(
            redirect,
            "redirect"
          );

          return {
            sourceId:
              assertSourceId(
                redirect.sourceId
              ),

            locationType:
              assertLocationType(
                redirect.locationType
              ),

            from:
              assertRoute(
                redirect.from,
                "redirect.from"
              ),

            to:
              assertRoute(
                redirect.to,
                "redirect.to"
              ),

            status:
              REDIRECT_STATUS
          };
        }
      )
      .sort(
        (a, b) =>
          a.from.localeCompare(
            b.from
          )
      );

  const seen =
    new Set();

  for (
    const redirect
    of normalized
  ) {
    if (
      seen.has(
        redirect.from
      )
    ) {
      fail(
        `Duplicate redirect source: ${redirect.from}`
      );
    }

    seen.add(
      redirect.from
    );

    if (
      redirect.from ===
      redirect.to
    ) {
      fail(
        `Redirect cannot point to itself: ${redirect.from}`
      );
    }
  }

  return (
    JSON.stringify(
      normalized,
      null,
      2
    ) + "\n"
  );
}

/**
 * ---------- PUBLIC API ----------
 */

module.exports = {
  SITE_URL,
  CANONICAL_HOST,

  REDIRECT_STATUS,
  CURRENT_STATUS,
  ACTIVE_STATUS,

  assertRoute,
  assertCanonicalEqualsRoute,

  calculateContentHash,

  normalizeManifestEntry,
  buildManifestIndex,

  migrateLocations,
  rollbackMigration,

  serializeManifest,
  serializeRedirects,

  sha256Json
};

/**
 * ---------- STANDALONE EXECUTION ----------
 *
 * Intentionally does NOT read or write project files.
 *
 * This protects V9 from accidental mutation.
 *
 * Integration tests should import the module.
 */

if (
  require.main === module
) {
  console.log(
    "LOCATION_MIGRATION_ENGINE=READY"
  );

  console.log(
    "Mode: library-only / fail-closed"
  );

  console.log(
    "No files modified."
  );

  console.log(
    "No database modified."
  );

  console.log(
    "No sitemap.xml modified."
  );
}
