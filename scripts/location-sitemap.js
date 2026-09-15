/**
 * Instant Legal Services
 * Location Sitemap Generator
 *
 * Purpose:
 * - Generate an isolated location sitemap from validated Registry rows.
 * - Never query the database directly.
 * - Never modify the existing sitemap.xml.
 * - Never delete files.
 * - Never commit or push to Git.
 *
 * Expected input:
 * [
 *   {
 *     id,
 *     location_type,
 *     canonical_name,
 *     canonical_slug,
 *     current_route
 *   }
 * ]
 */

const SITE_URL = "https://instantlegalservices.in";
const CANONICAL_HOST = "instantlegalservices.in";

const ALLOWED_LOCATION_TYPES = new Set([
  "STATE",
  "DISTRICT",
  "TEHSIL",
  "LOCAL_BODY",
  "AUTHORITY"
]);

function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }

  return value.trim();
}

function assertCanonicalRoute(value, field) {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }

  if (!value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }

  if (value !== value.trim()) {
    throw new Error(
      `${field} must not contain leading or trailing whitespace`
    );
  }

  if (!value.startsWith("/") || !value.endsWith("/")) {
    throw new Error(
      `${field} is not a canonical route: ${value}`
    );
  }

  return value;
}

function assertCanonicalUrl(route) {
  const canonicalRoute = assertCanonicalRoute(
    route,
    "current_route"
  );

  let url;

  try {
    url = new URL(canonicalRoute, SITE_URL);
  } catch {
    throw new Error(
      `Invalid canonical route URL: ${canonicalRoute}`
    );
  }

  if (url.protocol !== "https:") {
    throw new Error(
      `Canonical URL must use HTTPS: ${canonicalRoute}`
    );
  }

  if (url.hostname !== CANONICAL_HOST) {
    throw new Error(
      `Canonical URL has invalid hostname: ${url.hostname}`
    );
  }

  /*
   * A route must not introduce query strings,
   * fragments, username/password or another origin.
   */
  if (
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(
      `Canonical URL contains forbidden URL components: ${canonicalRoute}`
    );
  }

  return url.href;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Validate and normalize Registry SEO feed rows.
 *
 * Fail closed:
 * - malformed rows
 * - unsupported location types
 * - duplicate IDs
 * - duplicate current routes
 * - uppercase slugs
 * - invalid canonical routes
 */
function validateRows(rows) {
  if (!Array.isArray(rows)) {
    throw new Error(
      "Location sitemap input must be an array"
    );
  }

  const locationIds = new Set();
  const currentRoutes = new Set();

  const normalized = rows.map((row, index) => {
    if (
      !row ||
      typeof row !== "object" ||
      Array.isArray(row)
    ) {
      throw new Error(
        `Invalid Location Registry row at index ${index}`
      );
    }

    const id = assertNonEmptyString(
      row.id,
      "id"
    );

    const locationType = assertNonEmptyString(
      row.location_type,
      "location_type"
    );

    const canonicalName = assertNonEmptyString(
      row.canonical_name,
      "canonical_name"
    );

    const canonicalSlug = assertNonEmptyString(
      row.canonical_slug,
      "canonical_slug"
    );

    const currentRoute = assertCanonicalRoute(
      row.current_route,
      "current_route"
    );

    if (!ALLOWED_LOCATION_TYPES.has(locationType)) {
      throw new Error(
        `Unsupported location_type: ${locationType}`
      );
    }

    if (locationIds.has(id)) {
      throw new Error(
        `Duplicate location id: ${id}`
      );
    }

    if (currentRoutes.has(currentRoute)) {
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

    /*
     * Reject whitespace around slug.
     */
    if (canonicalSlug !== canonicalSlug.trim()) {
      throw new Error(
        `canonical_slug must not contain surrounding whitespace`
      );
    }

    /*
     * Sitemap must only contain canonical URLs
     * on the ILS HTTPS host.
     */
    assertCanonicalUrl(currentRoute);

    locationIds.add(id);
    currentRoutes.add(currentRoute);

    return {
      id,
      location_type: locationType,
      canonical_name: canonicalName,
      canonical_slug: canonicalSlug,
      current_route: currentRoute
    };
  });

  /*
   * Deterministic ordering:
   * location type → canonical name → stable ID
   */
  normalized.sort((a, b) => {
    const typeCompare =
      a.location_type.localeCompare(
        b.location_type
      );

    if (typeCompare !== 0) {
      return typeCompare;
    }

    const nameCompare =
      a.canonical_name.localeCompare(
        b.canonical_name
      );

    if (nameCompare !== 0) {
      return nameCompare;
    }

    return a.id.localeCompare(b.id);
  });

  return normalized;
}

/**
 * Generate XML sitemap from validated Registry rows.
 *
 * Historical routes are deliberately not accepted here.
 * Only current_route is emitted.
 */
function generateLocationSitemap(rows) {
  const normalizedRows = validateRows(rows);

  const urlEntries = normalizedRows.map(row => {
    const loc = escapeXml(
      assertCanonicalUrl(
        row.current_route
      )
    );

    return [
      "  <url>",
      `    <loc>${loc}</loc>`,
      "  </url>"
    ].join("\n");
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urlEntries,
    "</urlset>",
    ""
  ].join("\n");
}

/**
 * Validate generated sitemap XML at a structural level.
 *
 * This is intentionally dependency-free.
 */
function validateGeneratedSitemap(xml) {
  if (typeof xml !== "string") {
    throw new Error(
      "Generated sitemap must be a string"
    );
  }

  if (!xml.trim()) {
    throw new Error(
      "Generated sitemap must not be empty"
    );
  }

  if (
    !xml.startsWith(
      '<?xml version="1.0" encoding="UTF-8"?>'
    )
  ) {
    throw new Error(
      "Invalid sitemap XML declaration"
    );
  }

  if (
    !xml.includes(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    )
  ) {
    throw new Error(
      "Invalid sitemap urlset namespace"
    );
  }

  if (!xml.includes("</urlset>")) {
    throw new Error(
      "Sitemap urlset is not closed"
    );
  }

  const locMatches =
    xml.match(/<loc>[\s\S]*?<\/loc>/g) || [];

  const locs = new Set();

  for (const entry of locMatches) {
    const value = entry
      .replace(/^<loc>/, "")
      .replace(/<\/loc>$/, "");

    const decoded = value
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");

    const canonical = assertCanonicalUrl(
      decoded
    );

    if (locs.has(canonical)) {
      throw new Error(
        `Duplicate sitemap <loc>: ${canonical}`
      );
    }

    locs.add(canonical);
  }

  return true;
}

/**
 * Complete generation pipeline.
 *
 * Does not write to disk.
 */
function buildLocationSitemap(rows) {
  const xml =
    generateLocationSitemap(rows);

  validateGeneratedSitemap(xml);

  return xml;
}

module.exports = {
  ALLOWED_LOCATION_TYPES,
  validateRows,
  generateLocationSitemap,
  validateGeneratedSitemap,
  buildLocationSitemap
};

/*
 * This file is intentionally not a standalone CLI.
 *
 * The CI integration layer will:
 * 1. Load validated Registry feed.
 * 2. Pass current rows here.
 * 3. Receive XML.
 * 4. Validate the XML.
 * 5. Perform atomic file replacement separately.
 *
 * No DB/file/Git side effects belong in this module.
 */
