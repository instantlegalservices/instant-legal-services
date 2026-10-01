/**
 * Instant Legal Services
 * Canonical Sitemap Composer
 *
 * Purpose:
 * - Preserve the existing root sitemap URLs.
 * - Add current Location Registry routes.
 * - Remove historical Location Registry routes.
 * - Remove duplicate URLs.
 * - Produce one deterministic canonical sitemap.
 *
 * Safety:
 * - Pure in-memory transformation.
 * - No database access.
 * - No filesystem writes.
 * - No Git operations.
 * - Fail closed on malformed input.
 */

"use strict";

const {
  validateCurrentFeed,
  validateRedirectFeed,
  validateFeedConsistency
} = require("./location-registry-feed");

const {
  validateRows: validateLocationRows
} = require("./location-sitemap");

const SITE_URL =
  "https://instantlegalservices.in";

const CANONICAL_HOST =
  "instantlegalservices.in";

const SITEMAP_NAMESPACE =
  "http://www.sitemaps.org/schemas/sitemap/0.9";

const SITEMAP_LOC_MAX_LENGTH =
  2048;

const SITEMAP_MAX_URLS =
  50000;

const SITEMAP_MAX_BYTES =
  52_428_800;

const XML_DECLARATION =
  '<?xml version="1.0" encoding="UTF-8"?>';

const URLSET_OPEN =
  `<urlset xmlns="${SITEMAP_NAMESPACE}">`;

const CHANGEFREQ_VALUES =
  new Set([
    "always",
    "hourly",
    "daily",
    "weekly",
    "monthly",
    "yearly",
    "never"
  ]);

const CONTROL_CHAR_RE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const LASTMOD_RE =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

const PRIORITY_RE =
  /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/;

function getUtf8ByteLength(value) {
  return Buffer.byteLength(
    value,
    "utf8"
  );
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
 * Decode only the XML entities that this composer emits.
 */
function decodeXmlText(
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

  const decoded =
    value
      .replace(
        /&amp;/g,
        "&"
      )
      .replace(
        /&lt;/g,
        "<"
      )
      .replace(
        /&gt;/g,
        ">"
      )
      .replace(
        /&quot;/g,
        '"'
      )
      .replace(
        /&apos;/g,
        "'"
      );

  /*
   * Reject unknown/malformed entities.
   */
  if (
    /&(?:[^a]|a(?!mp;)|am(?!p;)|amp(?!;)|l(?!t;)|lt(?!;)|g(?!t;)|gt(?!;)|q(?!uot;)|quo(?!t;)|qu(?!ot;)|quot(?!;)|a(?!pos;)|ap(?!os;)|apo(?!s;)|apos(?!;))/
      .test(value)
  ) {
    throw new Error(
      `${field} contains an invalid XML entity`
    );
  }

  /*
   * Require canonical escaping.
   */
  if (
    escapeXml(decoded) !==
    value
  ) {
    throw new Error(
      `${field} is not canonically XML-escaped`
    );
  }

  return decoded;
}

/**
 * Validate an absolute canonical Sitemap URL.
 */
function assertCanonicalSitemapLoc(
  value,
  field = "loc"
) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${field} must be a non-empty string`
    );
  }

  if (
    value !== value.trim()
  ) {
    throw new Error(
      `${field} must not contain surrounding whitespace`
    );
  }

  if (
    CONTROL_CHAR_RE.test(value)
  ) {
    throw new Error(
      `${field} contains control characters`
    );
  }

  let url;

  try {
    url =
      new URL(value);
  } catch {
    throw new Error(
      `${field} is not a valid absolute URL: ${value}`
    );
  }

  if (
    url.protocol !== "https:"
  ) {
    throw new Error(
      `${field} must use HTTPS: ${value}`
    );
  }

  if (
    url.hostname !==
    CANONICAL_HOST
  ) {
    throw new Error(
      `${field} has invalid hostname: ${url.hostname}`
    );
  }

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${field} contains forbidden URL components: ${value}`
    );
  }

  if (
    url.href !== value
  ) {
    throw new Error(
      `${field} is not a canonical URL: ${value}`
    );
  }

  /*
   * Reject ambiguous pathname structures.
   */
  if (
    url.pathname.includes("//")
  ) {
    throw new Error(
      `${field} contains duplicate path slashes`
    );
  }

  if (
    url.pathname.includes("\\")
  ) {
    throw new Error(
      `${field} contains a backslash`
    );
  }

  const segments =
    url.pathname.split("/");

  if (
    segments.includes(".") ||
    segments.includes("..")
  ) {
    throw new Error(
      `${field} contains dot segments`
    );
  }

  if (
    value.length >=
    SITEMAP_LOC_MAX_LENGTH
  ) {
    throw new Error(
      `${field} must be shorter than ${SITEMAP_LOC_MAX_LENGTH} characters`
    );
  }

  return value;
}

function validateLastmod(
  value
) {
  if (
    typeof value !== "string" ||
    !LASTMOD_RE.test(value)
  ) {
    throw new Error(
      `Invalid <lastmod> value: ${value}`
    );
  }

  if (
    Number.isNaN(
      Date.parse(value)
    )
  ) {
    throw new Error(
      `Invalid <lastmod> date: ${value}`
    );
  }

  return value;
}

function validateChangefreq(
  value
) {
  if (
    typeof value !== "string" ||
    !CHANGEFREQ_VALUES.has(value)
  ) {
    throw new Error(
      `Invalid <changefreq> value: ${value}`
    );
  }

  return value;
}

function validatePriority(
  value
) {
  if (
    typeof value !== "string" ||
    !PRIORITY_RE.test(value)
  ) {
    throw new Error(
      `Invalid <priority> value: ${value}`
    );
  }

  const numeric =
    Number(value);

  if (
    !Number.isFinite(numeric) ||
    numeric < 0 ||
    numeric > 1
  ) {
    throw new Error(
      `Invalid <priority> value: ${value}`
    );
  }

  return value;
}

/**
 * Parse one <url> block.
 *
 * Only standard core Sitemap fields are accepted.
 * Extension namespaces fail closed instead of
 * being silently discarded.
 */
function parseUrlBlock(
  block,
  index
) {
  if (
    typeof block !== "string" ||
    !block.startsWith("<url>") ||
    !block.endsWith("</url>")
  ) {
    throw new Error(
      `Invalid <url> block at index ${index}`
    );
  }

  const inner =
    block.slice(
      "<url>".length,
      -"</url>".length
    );

  const childPattern =
    /^\s*<loc>([\s\S]*?)<\/loc>\s*(?:<lastmod>([\s\S]*?)<\/lastmod>\s*)?(?:<changefreq>([\s\S]*?)<\/changefreq>\s*)?(?:<priority>([\s\S]*?)<\/priority>\s*)?$/;

  const match =
    childPattern.exec(
      inner
    );

  if (!match) {
    throw new Error(
      `Unsupported or malformed <url> structure at index ${index}`
    );
  }

  const [
    ,
    encodedLoc,
    encodedLastmod,
    encodedChangefreq,
    encodedPriority
  ] = match;

  if (
    encodedLoc.includes("<") ||
    encodedLoc.includes(">")
  ) {
    throw new Error(
      `Malformed <loc> content at index ${index}`
    );
  }

  const loc =
    decodeXmlText(
      encodedLoc,
      `<loc> at index ${index}`
    );

  assertCanonicalSitemapLoc(
    loc,
    `<loc> at index ${index}`
  );

  const entry = {
    loc
  };

  if (
    encodedLastmod !==
    undefined
  ) {
    entry.lastmod =
      validateLastmod(
        decodeXmlText(
          encodedLastmod,
          `<lastmod> at index ${index}`
        )
      );
  }

  if (
    encodedChangefreq !==
    undefined
  ) {
    entry.changefreq =
      validateChangefreq(
        decodeXmlText(
          encodedChangefreq,
          `<changefreq> at index ${index}`
        )
      );
  }

  if (
    encodedPriority !==
    undefined
  ) {
    entry.priority =
      validatePriority(
        decodeXmlText(
          encodedPriority,
          `<priority> at index ${index}`
        )
      );
  }

  return entry;
}

/**
 * Parse and validate an existing root sitemap.
 */
function parseSitemap(
  xml
) {
  if (
    typeof xml !== "string"
  ) {
    throw new Error(
      "existing sitemap must be a string"
    );
  }

  if (
    !xml.trim()
  ) {
    throw new Error(
      "existing sitemap must not be empty"
    );
  }

  if (
    getUtf8ByteLength(xml) >
    SITEMAP_MAX_BYTES
  ) {
    throw new Error(
      `existing sitemap exceeds ${SITEMAP_MAX_BYTES} bytes`
    );
  }

  const expectedPrefix =
    `${XML_DECLARATION}\n${URLSET_OPEN}\n`;

  const expectedSuffix =
    "\n</urlset>\n";

  if (
    !xml.startsWith(
      expectedPrefix
    )
  ) {
    throw new Error(
      "existing sitemap has an invalid XML declaration or urlset"
    );
  }

  if (
    !xml.endsWith(
      expectedSuffix
    )
  ) {
    throw new Error(
      "existing sitemap must end with </urlset>"
    );
  }

  const body =
    xml.slice(
      expectedPrefix.length,
      xml.length -
        expectedSuffix.length
    );

  if (
    !body.trim()
  ) {
    return [];
  }

  const entries = [];
  let cursor = 0;

  while (
    cursor < body.length
  ) {
    while (
      cursor < body.length &&
      /\s/.test(
        body[cursor]
      )
    ) {
      cursor++;
    }

    if (
      cursor >= body.length
    ) {
      break;
    }

    if (
      !body.startsWith(
        "<url>",
        cursor
      )
    ) {
      throw new Error(
        "existing sitemap contains unexpected content outside <url>"
      );
    }

    const closeIndex =
      body.indexOf(
        "</url>",
        cursor +
          "<url>".length
      );

    if (
      closeIndex === -1
    ) {
      throw new Error(
        "existing sitemap contains an unclosed <url>"
      );
    }

    const block =
      body.slice(
        cursor,
        closeIndex +
          "</url>".length
      );

    entries.push(
      parseUrlBlock(
        block,
        entries.length
      )
    );

    cursor =
      closeIndex +
      "</url>".length;
  }

  if (
    entries.length >
    SITEMAP_MAX_URLS
  ) {
    throw new Error(
      `existing sitemap contains more than ${SITEMAP_MAX_URLS} URLs`
    );
  }

  const seen =
    new Set();

  for (
    const entry of entries
  ) {
    if (
      seen.has(entry.loc)
    ) {
      throw new Error(
        `Duplicate existing sitemap <loc>: ${entry.loc}`
      );
    }

    seen.add(entry.loc);
  }

  return entries;
}

function routeToAbsoluteUrl(
  route,
  field
) {
  if (
    typeof route !== "string" ||
    !route.trim()
  ) {
    throw new Error(
      `${field} must be a non-empty route`
    );
  }

  if (
    route !== route.trim()
  ) {
    throw new Error(
      `${field} must not contain surrounding whitespace`
    );
  }

  if (
    !route.startsWith("/") ||
    !route.endsWith("/")
  ) {
    throw new Error(
      `${field} must be a canonical route: ${route}`
    );
  }

  return assertCanonicalSitemapLoc(
    `${SITE_URL}${route}`,
    field
  );
}

function normalizeFeeds(
  currentRows,
  redirectRows
) {
  const currentFeed =
    validateCurrentFeed(
      currentRows
    );

  const redirectFeed =
    validateRedirectFeed(
      redirectRows,
      currentFeed
    );

  validateFeedConsistency(
    currentFeed,
    redirectFeed
  );

  const locationRows =
    validateLocationRows(
      currentFeed
    );

  return {
    currentFeed,
    redirectFeed,
    locationRows
  };
}

function renderEntry(
  entry
) {
  const lines = [
    "  <url>",
    `    <loc>${escapeXml(entry.loc)}</loc>`
  ];

  if (
    entry.lastmod !==
    undefined
  ) {
    lines.push(
      `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`
    );
  }

  if (
    entry.changefreq !==
    undefined
  ) {
    lines.push(
      `    <changefreq>${escapeXml(entry.changefreq)}</changefreq>`
    );
  }

  if (
    entry.priority !==
    undefined
  ) {
    lines.push(
      `    <priority>${escapeXml(entry.priority)}</priority>`
    );
  }

  lines.push(
    "  </url>"
  );

  return lines.join("\n");
}

function renderSitemap(
  entries
) {
  if (
    !Array.isArray(entries)
  ) {
    throw new Error(
      "entries must be an array"
    );
  }

  if (
    entries.length >
    SITEMAP_MAX_URLS
  ) {
    throw new Error(
      `Sitemap cannot contain more than ${SITEMAP_MAX_URLS} URLs`
    );
  }

  const xml = [
    XML_DECLARATION,
    URLSET_OPEN,
    ...entries.map(
      renderEntry
    ),
    "</urlset>",
    ""
  ].join("\n");

  if (
    getUtf8ByteLength(xml) >
    SITEMAP_MAX_BYTES
  ) {
    throw new Error(
      `composed sitemap exceeds ${SITEMAP_MAX_BYTES} bytes`
    );
  }

  return xml;
}

function validateComposedSitemap(
  xml
) {
  const entries =
    parseSitemap(xml);

  const seen =
    new Set();

  for (
    const entry of entries
  ) {
    assertCanonicalSitemapLoc(
      entry.loc
    );

    if (
      seen.has(entry.loc)
    ) {
      throw new Error(
        `Duplicate composed sitemap <loc>: ${entry.loc}`
      );
    }

    seen.add(entry.loc);
  }

  return true;
}

/**
 * Compose final canonical sitemap.
 *
 * Existing static URLs:
 *   preserved.
 *
 * Historical Registry URLs:
 *   removed.
 *
 * Current Registry URLs:
 *   added.
 *
 * If a current Registry URL already exists in the
 * old sitemap, Registry ownership wins and stale
 * optional metadata is removed.
 */
function composeSitemap(
  existingXml,
  currentRows,
  redirectRows
) {
  const existingEntries =
    parseSitemap(
      existingXml
    );

  const {
    locationRows,
    redirectFeed
  } =
    normalizeFeeds(
      currentRows,
      redirectRows
    );

  const currentUrls =
    new Set(
      locationRows.map(
        row =>
          routeToAbsoluteUrl(
            row.current_route,
            "current_route"
          )
      )
    );

  const historicalUrls =
    new Set(
      redirectFeed.map(
        row =>
          routeToAbsoluteUrl(
            row.route,
            "historical route"
          )
      )
    );

  /*
   * Hard collision protection.
   */
  for (
    const historicalUrl of historicalUrls
  ) {
    if (
      currentUrls.has(
        historicalUrl
      )
    ) {
      throw new Error(
        `Historical route is also a current route: ${historicalUrl}`
      );
    }
  }

  const byUrl =
    new Map();

  let historicalRoutesExcluded = 0;
  let duplicateCurrentRoutesReplaced = 0;

  for (
    const entry of existingEntries
  ) {
    if (
      historicalUrls.has(
        entry.loc
      )
    ) {
      historicalRoutesExcluded++;
      continue;
    }

    if (
      currentUrls.has(
        entry.loc
      )
    ) {
      duplicateCurrentRoutesReplaced++;
      continue;
    }

    byUrl.set(
      entry.loc,
      entry
    );
  }

  /*
   * Current Registry routes are re-added
   * without stale optional metadata.
   */
  for (
    const currentUrl of currentUrls
  ) {
    byUrl.set(
      currentUrl,
      {
        loc: currentUrl
      }
    );
  }

  const entries =
    Array.from(
      byUrl.values()
    ).sort(
      (a, b) =>
        a.loc.localeCompare(
          b.loc
        )
    );

  if (
    entries.length >
    SITEMAP_MAX_URLS
  ) {
    throw new Error(
      `Composed sitemap cannot contain more than ${SITEMAP_MAX_URLS} URLs`
    );
  }

  const xml =
    renderSitemap(
      entries
    );

  validateComposedSitemap(
    xml
  );

  return {
    xml,
    existingCount:
      existingEntries.length,
    currentLocationCount:
      locationRows.length,
    historicalRoutesExcluded,
    duplicateCurrentRoutesReplaced,
    finalCount:
      entries.length
  };
}

module.exports = {
  SITE_URL,
  CANONICAL_HOST,
  SITEMAP_NAMESPACE,
  SITEMAP_LOC_MAX_LENGTH,
  SITEMAP_MAX_URLS,
  SITEMAP_MAX_BYTES,
  parseSitemap,
  validateComposedSitemap,
  composeSitemap,
  renderSitemap,
  escapeXml,
  getUtf8ByteLength
};
