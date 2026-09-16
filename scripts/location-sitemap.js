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
 *
 * Location route convention:
 * - STATE       -> legacy-owned for now
 * - DISTRICT    -> legacy-owned for now
 * - TEHSIL      -> /tehsil/{slug}/
 * - LOCAL_BODY  -> /local-body/{slug}/
 * - AUTHORITY   -> /authority/{slug}/
 *
 * Important:
 * - canonical_slug is NOT the identity of a location.
 * - Registry id is the stable identity.
 * - STATE/DISTRICT are intentionally not forced into the new
 *   route convention until explicit legacy ownership handover.
 */

"use strict";

const SITE_URL = "https://instantlegalservices.in";
const CANONICAL_HOST = "instantlegalservices.in";

const SITEMAP_LOC_MAX_LENGTH = 2048;
const SITEMAP_MAX_URLS = 50000;
const SITEMAP_MAX_BYTES = 52_428_800;

const ALLOWED_LOCATION_TYPES = new Set([
  "STATE",
  "DISTRICT",
  "TEHSIL",
  "LOCAL_BODY",
  "AUTHORITY"
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CANONICAL_SLUG_RE =
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const CONTROL_CHAR_RE =
  /[\u0000-\u001F\u007F]/;

const TYPED_ROUTE_PREFIXES = Object.freeze({
  TEHSIL: "/tehsil/",
  LOCAL_BODY: "/local-body/",
  AUTHORITY: "/authority/"
});

function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }

  return value.trim();
}

function assertUuid(value, field) {
  const id = assertNonEmptyString(value, field);

  if (!UUID_RE.test(id)) {
    throw new Error(`${field} must be a valid UUID`);
  }

  return id.toLowerCase();
}

function assertCanonicalSlug(value, field) {
  const slug = assertNonEmptyString(value, field);

  if (slug !== slug.trim()) {
    throw new Error(
      `${field} must not contain surrounding whitespace`
    );
  }

  if (slug !== slug.toLowerCase()) {
    throw new Error(
      `${field} must be lowercase: ${slug}`
    );
  }

  if (!CANONICAL_SLUG_RE.test(slug)) {
    throw new Error(
      `${field} is not a valid canonical slug: ${slug}`
    );
  }

  return slug;
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

  /*
   * Reject characters that can make route interpretation
   * ambiguous or unsafe.
   */
  if (CONTROL_CHAR_RE.test(value)) {
    throw new Error(
      `${field} contains control characters`
    );
  }

  /*
   * Backslashes are deliberately forbidden.
   * They can be interpreted differently by URL/path layers.
   */
  if (value.includes("\\")) {
    throw new Error(
      `${field} must not contain backslashes`
    );
  }

  /*
   * Canonical routes must not contain dot-segments.
   */
  const pathSegments = value.split("/");

  if (
    pathSegments.some(
      segment => segment === "." || segment === ".."
    )
  ) {
    throw new Error(
      `${field} must not contain dot-segments`
    );
  }

  return value;
}

/**
 * Validate a Registry current_route and return
 * its canonical absolute HTTPS URL.
 */
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

  /*
   * Ensure URL parsing did not normalize the supplied route
   * into a different pathname.
   */
  if (url.pathname !== canonicalRoute) {
    throw new Error(
      `Canonical route changes after URL normalization: ${canonicalRoute}`
    );
  }

  const href = url.href;

  /*
   * Official Sitemap protocol requires the <loc> value
   * to be less than 2,048 characters.
   */
  if (href.length >= SITEMAP_LOC_MAX_LENGTH) {
    throw new Error(
      `current_route exceeds the Sitemap <loc> maximum length of ${SITEMAP_LOC_MAX_LENGTH} characters`
    );
  }

  return href;
}

/**
 * Validate an already-generated Sitemap <loc>.
 *
 * IMPORTANT:
 * - Generated <loc> is an absolute URL.
 * - Registry current_route is a route path.
 *
 * Therefore <loc> must NOT be passed directly to
 * assertCanonicalUrl(), because that function validates
 * current_route paths.
 *
 * This function validates:
 * - absolute HTTPS URL
 * - exact canonical host
 * - no query
 * - no fragment
 * - no credentials
 * - canonical serialized URL
 * - canonical route pathname
 * - Sitemap <loc> length
 */
function assertCanonicalSitemapLoc(value) {
  if (typeof value !== "string") {
    throw new Error(
      "Sitemap <loc> must be a string"
    );
  }

  if (!value.trim()) {
    throw new Error(
      "Sitemap <loc> must not be empty"
    );
  }

  if (value !== value.trim()) {
    throw new Error(
      "Sitemap <loc> must not contain leading or trailing whitespace"
    );
  }

  if (CONTROL_CHAR_RE.test(value)) {
    throw new Error(
      "Sitemap <loc> contains control characters"
    );
  }

  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `Invalid Sitemap <loc> URL: ${value}`
    );
  }

  /*
   * Sitemap <loc> must be an absolute HTTPS URL.
   */
  if (url.protocol !== "https:") {
    throw new Error(
      `Sitemap <loc> must use HTTPS: ${value}`
    );
  }

  /*
   * Only the canonical ILS host is permitted.
   */
  if (url.hostname !== CANONICAL_HOST) {
    throw new Error(
      `Sitemap <loc> has invalid hostname: ${url.hostname}`
    );
  }

  /*
   * No query strings, fragments or credentials.
   */
  if (
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(
      `Sitemap <loc> contains forbidden URL components: ${value}`
    );
  }

  /*
   * Reject URLs whose serialization changes after parsing.
   * This prevents non-canonical representations from
   * entering the sitemap.
   */
  if (url.href !== value) {
    throw new Error(
      `Sitemap <loc> is not a canonical URL: ${value}`
    );
  }

  /*
   * Validate the pathname using the same strict route
   * validation used by Registry current_route.
   */
  const route =
    assertCanonicalRoute(
      url.pathname,
      "current_route"
    );

  /*
   * Reconstruct the canonical absolute URL from the
   * validated route and require exact equality.
   */
  const canonicalHref =
    `${SITE_URL}${route}`;

  if (canonicalHref !== value) {
    throw new Error(
      `Sitemap <loc> does not match canonical route: ${value}`
    );
  }

  /*
   * Sitemap <loc> maximum length.
   */
  if (value.length >= SITEMAP_LOC_MAX_LENGTH) {
    throw new Error(
      `Sitemap <loc> exceeds the maximum length of ${SITEMAP_LOC_MAX_LENGTH} characters`
    );
  }

  return value;
}

function assertRouteMatchesLocationType(
  locationType,
  canonicalSlug,
  currentRoute
) {
  /*
   * STATE and DISTRICT intentionally remain outside this
   * strict convention until explicit legacy ownership handover.
   */
  const prefix =
    TYPED_ROUTE_PREFIXES[locationType];

  if (!prefix) {
    return;
  }

  const expectedRoute =
    `${prefix}${canonicalSlug}/`;

  if (currentRoute !== expectedRoute) {
    throw new Error(
      `current_route does not match ${locationType} canonical_slug: ` +
      `${currentRoute} != ${expectedRoute}`
    );
  }
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
 * Return UTF-8 byte length.
 *
 * Sitemap size limit is defined in bytes, not JavaScript
 * character count.
 */
function getUtf8ByteLength(value) {
  return Buffer.byteLength(value, "utf8");
}

/**
 * Validate and normalize Registry SEO feed rows.
 *
 * Fail closed:
 * - malformed rows
 * - unsupported location types
 * - invalid UUIDs
 * - duplicate IDs
 * - duplicate current routes
 * - invalid canonical slugs
 * - invalid canonical routes
 * - typed route/slug mismatches
 * - more than 50,000 URLs
 */
function validateRows(rows) {
  if (!Array.isArray(rows)) {
    throw new Error(
      "Location sitemap input must be an array"
    );
  }

  if (rows.length > SITEMAP_MAX_URLS) {
    throw new Error(
      `Sitemap cannot contain more than ${SITEMAP_MAX_URLS} URLs`
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

    const id = assertUuid(
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

    const canonicalSlug = assertCanonicalSlug(
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

    /*
     * Sitemap must only contain canonical URLs
     * on the ILS HTTPS host.
     */
    assertCanonicalUrl(currentRoute);

    /*
     * Enforce the new route convention only for
     * Registry-owned location namespaces.
     */
    assertRouteMatchesLocationType(
      locationType,
      canonicalSlug,
      currentRoute
    );

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
  const normalizedRows =
    validateRows(rows);

  const urlEntries =
    normalizedRows.map(row => {
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

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urlEntries,
    "</urlset>",
    ""
  ].join("\n");

  /*
   * Enforce the uncompressed Sitemap file-size limit
   * before returning generated XML.
   */
  const byteLength =
    getUtf8ByteLength(xml);

  if (byteLength > SITEMAP_MAX_BYTES) {
    throw new Error(
      `Generated sitemap exceeds the maximum uncompressed size of ${SITEMAP_MAX_BYTES} bytes`
    );
  }

  return xml;
}

/**
 * Validate generated sitemap XML.
 *
 * This is intentionally dependency-free and fail-closed.
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

  /*
   * Sitemap size is measured uncompressed in UTF-8 bytes.
   */
  const byteLength =
    getUtf8ByteLength(xml);

  if (byteLength > SITEMAP_MAX_BYTES) {
    throw new Error(
      `Generated sitemap exceeds the maximum uncompressed size of ${SITEMAP_MAX_BYTES} bytes`
    );
  }

  const XML_DECLARATION =
    '<?xml version="1.0" encoding="UTF-8"?>';

  const URLSET_OPEN =
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

  const URLSET_CLOSE =
    "</urlset>";

  if (!xml.startsWith(XML_DECLARATION)) {
    throw new Error(
      "Invalid sitemap XML declaration"
    );
  }

  if (
    !xml.startsWith(
      `\n${URLSET_OPEN}\n`,
      XML_DECLARATION.length
    )
  ) {
    throw new Error(
      "Invalid sitemap urlset namespace"
    );
  }

  if (!xml.endsWith(`${URLSET_CLOSE}\n`)) {
    throw new Error(
      "Sitemap urlset is not closed"
    );
  }

  const bodyStart =
    XML_DECLARATION.length +
    1 +
    URLSET_OPEN.length +
    1;

  const bodyEnd =
    xml.length -
    (URLSET_CLOSE.length + 1);

  const body =
    xml.slice(bodyStart, bodyEnd);

  /*
   * Empty Sitemap is valid.
   */
  if (!body) {
    return true;
  }

  const urlBlocks =
    body.split("\n  </url>");

  /*
   * Official Sitemap protocol:
   * maximum 50,000 <url> entries.
   */
  if (
    urlBlocks.length >
    SITEMAP_MAX_URLS
  ) {
    throw new Error(
      `Sitemap cannot contain more than ${SITEMAP_MAX_URLS} URLs`
    );
  }

  const locs = new Set();

  for (const block of urlBlocks) {
    const prefix =
      "  <url>\n    <loc>";

    /*
     * This exact structure ensures:
     * - every <url> has one <loc>
     * - <loc> cannot exist outside <url>
     * - extra XML between <url> and <loc> is rejected
     * - missing </loc> is rejected
     */
    if (
      !block.startsWith(prefix) ||
      !block.endsWith("</loc>")
    ) {
      throw new Error(
        "Sitemap must contain exactly one <loc> per <url>"
      );
    }

    const value =
      block.slice(
        prefix.length,
        -"</loc>".length
      );

    /*
     * A nested or additional <loc> is structurally invalid.
     */
    if (
      value.includes("<loc>") ||
      value.includes("</loc>")
    ) {
      throw new Error(
        "Sitemap must contain exactly one <loc> per <url>"
      );
    }

    /*
     * Decode the XML entities produced by escapeXml()
     * before validating the absolute URL.
     */
    const decoded =
      value
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");

    /*
     * IMPORTANT:
     * Generated <loc> is an absolute URL, therefore use
     * assertCanonicalSitemapLoc() instead of
     * assertCanonicalUrl(), which validates route paths.
     */
    const canonical =
      assertCanonicalSitemapLoc(decoded);

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
