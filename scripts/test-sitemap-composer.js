"use strict";

const assert = require("assert");

const {
  composeSitemap,
  parseSitemap,
  validateComposedSitemap
} = require("./sitemap-composer");

const VALID_ID_1 =
  "11111111-1111-4111-8111-111111111111";

const VALID_ID_2 =
  "22222222-2222-4222-8222-222222222222";

const CURRENT_FEED = [
  {
    id: VALID_ID_1,
    location_type: "DISTRICT",
    canonical_name: "Bareilly",
    canonical_slug: "bareilly",
    current_route: "/bareilly/"
  },
  {
    id: VALID_ID_2,
    location_type: "TEHSIL",
    canonical_name: "Aonla",
    canonical_slug: "aonla",
    current_route: "/tehsil/aonla/"
  }
];

const REDIRECT_FEED = [
  {
    location_id: VALID_ID_1,
    route: "/bareilly-old/",
    redirect_to: "/bareilly/"
  }
];

const BASE_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://instantlegalservices.in/</loc></url>
  <url><loc>https://instantlegalservices.in/about.html</loc></url>
  <url><loc>https://instantlegalservices.in/bareilly-old/</loc></url>
</urlset>
`;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    console.error(error && error.stack
      ? error.stack
      : error);
    process.exitCode = 1;
  }
}

function expectThrow(name, fn) {
  test(name, () => {
    assert.throws(fn);
  });
}

test(
  "valid sitemap parses",
  () => {
    const entries =
      parseSitemap(BASE_SITEMAP);

    assert.strictEqual(
      entries.length,
      3
    );
  }
);

test(
  "composer preserves existing static URLs",
  () => {
    const result =
      composeSitemap(
        BASE_SITEMAP,
        CURRENT_FEED,
        REDIRECT_FEED
      );

    assert.match(
      result.xml,
      /https:\/\/instantlegalservices\.in\/about\.html/
    );
  }
);

test(
  "composer adds every current Registry route",
  () => {
    const result =
      composeSitemap(
        BASE_SITEMAP,
        CURRENT_FEED,
        REDIRECT_FEED
      );

    assert.match(
      result.xml,
      /https:\/\/instantlegalservices\.in\/bareilly\//
    );

    assert.match(
      result.xml,
      /https:\/\/instantlegalservices\.in\/tehsil\/aonla\//
    );
  }
);

test(
  "historical Registry route is excluded",
  () => {
    const result =
      composeSitemap(
        BASE_SITEMAP,
        CURRENT_FEED,
        REDIRECT_FEED
      );

    assert.doesNotMatch(
      result.xml,
      /https:\/\/instantlegalservices\.in\/bareilly-old\//
    );

    assert.strictEqual(
      result.historicalRoutesExcluded,
      1
    );
  }
);

test(
  "current Registry route replaces stale existing metadata",
  () => {
    const existing = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://instantlegalservices.in/bareilly/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;

    const result =
      composeSitemap(
        existing,
        CURRENT_FEED,
        []
      );

    assert.strictEqual(
      result.duplicateCurrentRoutesReplaced,
      1
    );

    assert.doesNotMatch(
      result.xml,
      /<changefreq>/
    );

    assert.doesNotMatch(
      result.xml,
      /<priority>/
    );
  }
);

test(
  "final sitemap contains no duplicate URLs",
  () => {
    const result =
      composeSitemap(
        BASE_SITEMAP,
        CURRENT_FEED,
        REDIRECT_FEED
      );

    const entries =
      parseSitemap(result.xml);

    const urls =
      entries.map(
        entry => entry.loc
      );

    assert.strictEqual(
      new Set(urls).size,
      urls.length
    );
  }
);

test(
  "final sitemap is deterministically sorted",
  () => {
    const result =
      composeSitemap(
        BASE_SITEMAP,
        CURRENT_FEED,
        REDIRECT_FEED
      );

    const entries =
      parseSitemap(result.xml);

    const urls =
      entries.map(
        entry => entry.loc
      );

    const sorted =
      [...urls].sort(
        (a, b) =>
          a.localeCompare(b)
      );

    assert.deepStrictEqual(
      urls,
      sorted
    );
  }
);

test(
  "final sitemap passes its own validator",
  () => {
    const result =
      composeSitemap(
        BASE_SITEMAP,
        CURRENT_FEED,
        REDIRECT_FEED
      );

    assert.strictEqual(
      validateComposedSitemap(
        result.xml
      ),
      true
    );
  }
);

test(
  "empty Registry feed preserves existing sitemap",
  () => {
    const result =
      composeSitemap(
        BASE_SITEMAP,
        [],
        []
      );

    assert.match(
      result.xml,
      /https:\/\/instantlegalservices\.in\/about\.html/
    );

    assert.strictEqual(
      result.currentLocationCount,
      0
    );
  }
);

expectThrow(
  "historical route cannot also be current",
  () => {
    composeSitemap(
      BASE_SITEMAP,
      CURRENT_FEED,
      [
        {
          location_id: VALID_ID_1,
          route: "/bareilly/",
          redirect_to: "/tehsil/aonla/"
        }
      ]
    );
  }
);

expectThrow(
  "invalid current feed row is rejected",
  () => {
    composeSitemap(
      BASE_SITEMAP,
      [
        {
          id: "bad-id",
          location_type: "DISTRICT",
          canonical_name: "Bad",
          canonical_slug: "bad",
          current_route: "/bad/"
        }
      ],
      []
    );
  }
);

expectThrow(
  "unsupported location type is rejected",
  () => {
    composeSitemap(
      BASE_SITEMAP,
      [
        {
          id: VALID_ID_1,
          location_type: "COURT",
          canonical_name: "Court",
          canonical_slug: "court",
          current_route: "/court/"
        }
      ],
      []
    );
  }
);

expectThrow(
  "TEHSIL route namespace mismatch is rejected",
  () => {
    composeSitemap(
      BASE_SITEMAP,
      [
        {
          id: VALID_ID_1,
          location_type: "TEHSIL",
          canonical_name: "Aonla",
          canonical_slug: "aonla",
          current_route: "/aonla/"
        }
      ],
      []
    );
  }
);

expectThrow(
  "invalid sitemap hostname is rejected",
  () => {
    parseSitemap(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc></url>
</urlset>
`);
  }
);

expectThrow(
  "HTTP sitemap URL is rejected",
  () => {
    parseSitemap(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>http://instantlegalservices.in/</loc></url>
</urlset>
`);
  }
);

expectThrow(
  "query-string URL is rejected",
  () => {
    parseSitemap(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://instantlegalservices.in/page/?x=1</loc></url>
</urlset>
`);
  }
);

expectThrow(
  "fragment URL is rejected",
  () => {
    parseSitemap(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://instantlegalservices.in/page/#x</loc></url>
</urlset>
`);
  }
);

expectThrow(
  "duplicate existing sitemap URL is rejected",
  () => {
    parseSitemap(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://instantlegalservices.in/a/</loc></url>
  <url><loc>https://instantlegalservices.in/a/</loc></url>
</urlset>
`);
  }
);

expectThrow(
  "unsupported XML extension is rejected",
  () => {
    parseSitemap(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://instantlegalservices.in/a/</loc>
    <image:image>
      <image:loc>https://instantlegalservices.in/x.jpg</image:loc>
    </image:image>
  </url>
</urlset>
`);
  }
);

expectThrow(
  "malformed XML content outside url is rejected",
  () => {
    parseSitemap(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  garbage
  <url><loc>https://instantlegalservices.in/a/</loc></url>
</urlset>
`);
  }
);

test(
  "XML escaping round trip remains valid",
  () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://instantlegalservices.in/a%26b/</loc></url>
</urlset>
`;

    const entries =
      parseSitemap(xml);

    assert.strictEqual(
      entries[0].loc,
      "https://instantlegalservices.in/a%26b/"
    );
  }
);

if (process.exitCode) {
  console.error(
    "SITEMAP_COMPOSER_TEST=FAIL"
  );
  process.exit(1);
}

console.log(
  "SITEMAP_COMPOSER_TEST=PASS"
);
