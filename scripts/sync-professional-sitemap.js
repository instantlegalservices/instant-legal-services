const fs = require("fs");
const path = require("path");

const SITE_URL = "https://instantlegalservices.in";
const SITEMAP_PATH = path.join(process.cwd(), "sitemap.xml");
const API_URL = process.env.PROFESSIONALS_API_URL;
const API_KEY = process.env.PROFESSIONALS_API_KEY;

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchProfessionals() {
  if (!API_URL || !API_KEY) throw new Error("Missing public professional SEO feed configuration");
  const response = await fetch(API_URL, {
    headers: {
      apikey: API_KEY,
      Authorization: `Bearer ${API_KEY}`
    }
  });
  if (!response.ok) throw new Error(`Professional feed failed: HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error("Professional feed must return an array");
  return data;
}

function currentProfessionalUrls(rows) {
  const used = new Map();
  const sorted = [...rows].sort((a, b) =>
    String(a.professional_type || "").localeCompare(String(b.professional_type || "")) ||
    String(a.id || "").localeCompare(String(b.id || ""))
  );

  const urls = new Set();

  for (const row of sorted) {
    if (!["ca", "cs"].includes(String(row.professional_type || "").toLowerCase())) continue;
    const name = String(row.full_name || "").trim();
    if (!name) continue;

    const type = String(row.professional_type).toLowerCase();
    const base = slugify(name) || "professional";
    const key = `${type}/${base}`;
    const n = (used.get(key) || 0) + 1;
    used.set(key, n);

    urls.add(`${SITE_URL}/professional/${type}/${base}${n > 1 ? `-${n}` : ""}/`);
  }

  return urls;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function main() {
  const rows = await fetchProfessionals();
  const desired = currentProfessionalUrls(rows);

  const original = fs.readFileSync(SITEMAP_PATH, "utf8");
  if (!original.includes("<urlset") || !original.includes("</urlset>")) {
    throw new Error("Invalid sitemap.xml");
  }

  const existing = new Set(
    [...original.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim())
  );

  const preserved = [...existing].filter(url =>
    !/^https:\/\/instantlegalservices\.in\/professional\/(?:ca|cs)\//.test(url)
  );

  const finalUrls = [...new Set([...preserved, ...desired])].sort();

  if (finalUrls.some(url =>
    !url.startsWith(`${SITE_URL}/`) || /[?#]/.test(url)
  )) {
    throw new Error("Professional sitemap produced an invalid URL");
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...finalUrls.map(url => `  <url><loc>${escapeXml(url)}</loc></url>`),
    '</urlset>',
    ''
  ].join("\n");

  const tempPath = `${SITEMAP_PATH}.professional.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, xml, "utf8");
  fs.renameSync(tempPath, SITEMAP_PATH);

  console.log(`Professional sitemap synchronized: ${desired.size} public professional URLs.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
