const fs = require("fs");
const path = require("path");

const SITE_URL = "https://instantlegalservices.in";
const API_URL = process.env.ADVOCATES_API_URL;
const API_KEY = process.env.ADVOCATES_API_KEY;

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function arrayValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  if (typeof value === "string") {
    return value
      .split(",")
      .map(v => v.trim())
      .filter(Boolean);
  }
  return [];
}

function getValue(obj, names) {
  for (const name of names) {
    if (obj[name] !== undefined && obj[name] !== null && obj[name] !== "") {
      return obj[name];
    }
  }
  return "";
}

function pageTemplate({ title, description, canonical, heading, content, schema }) {
  return `<!DOCTYPE html>
<html lang="en-IN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index, follow">

<link rel="canonical" href="${canonical}">

<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="Instant Legal Services">

<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
</script>

<style>
body{font-family:Arial,sans-serif;margin:0;background:#f7f7f7;color:#222}
header{background:#111;color:#fff;padding:20px;text-align:center}
main{max-width:1000px;margin:30px auto;background:#fff;padding:30px;border-radius:12px}
h1{font-size:32px}
a{color:#a00;text-decoration:none}
.card{border:1px solid #ddd;padding:18px;margin:15px 0;border-radius:10px}
footer{text-align:center;padding:30px;color:#666}
</style>
</head>

<body>
<header>
<h2>Instant Legal Services</h2>
<p>Legal Services | Panel of Advocates | Pan India</p>
</header>

<main>
<h1>${escapeHtml(heading)}</h1>
${content}
</main>

<footer>
© ${new Date().getFullYear()} Instant Legal Services
</footer>
</body>
</html>`;
}

function writePage(route, html) {
  const cleanRoute = route.replace(/^\/+|\/+$/g, "");
  const folder = path.join(process.cwd(), cleanRoute);

  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, "index.html"), html);

  console.log(`Created: /${cleanRoute}/`);
}

async function fetchAdvocates() {
  if (!API_URL) {
    throw new Error("ADVOCATES_API_URL is missing");
  }

  const headers = {
    "Content-Type": "application/json"
  };

  if (API_KEY) {
    headers.apikey = API_KEY;
    headers.Authorization = `Bearer ${API_KEY}`;
  }

  const response = await fetch(API_URL, { headers });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function main() {
  console.log("Starting Dynamic SEO Page Generator...");

  const advocates = await fetchAdvocates();

  if (!Array.isArray(advocates)) {
    throw new Error("API must return an array of advocates");
  }

  // ONLY APPROVED + PUBLIC ADVOCATES
  const approvedAdvocates = advocates.filter(advocate => {
    const status = String(
      getValue(advocate, [
        "verification_status",
        "status",
        "approval_status"
      ])
    ).toLowerCase();

    const isPublic = getValue(advocate, [
      "public_profile",
      "is_public",
      "profile_public"
    ]);

    return status === "approved" &&
      (isPublic === true ||
       String(isPublic).toLowerCase() === "true" ||
       isPublic === 1 ||
       String(isPublic) === "1");
  });

  console.log(`Approved public advocates: ${approvedAdvocates.length}`);

  const states = new Map();
  const districts = new Map();
  const courts = new Map();
  const practices = new Map();

  for (const advocate of approvedAdvocates) {

    const name = getValue(advocate, [
      "advocate_name",
      "name",
      "full_name"
    ]);

    const state = getValue(advocate, [
      "state",
      "state_name"
    ]);

    const district = getValue(advocate, [
      "district",
      "district_name",
      "city"
    ]);

    const court = getValue(advocate, [
      "court",
      "court_name"
    ]);

    const practiceAreas = arrayValue(
      getValue(advocate, [
        "practice_areas",
        "practice_area",
        "specialization",
        "specialisations"
      ])
    );

    // STATE
    if (state) {
      const slug = slugify(state);

      if (!states.has(slug)) {
        states.set(slug, {
          name: state,
          advocates: []
        });
      }

      states.get(slug).advocates.push(advocate);
    }

    // DISTRICT
    if (district) {
      const slug = slugify(district);

      if (!districts.has(slug)) {
        districts.set(slug, {
          name: district,
          state,
          advocates: []
        });
      }

      districts.get(slug).advocates.push(advocate);
    }

    // COURT
    if (court) {
      const slug = slugify(court);

      if (!courts.has(slug)) {
        courts.set(slug, {
          name: court,
          district,
          state,
          advocates: []
        });
      }

      courts.get(slug).advocates.push(advocate);
    }

    // PRACTICE AREA
    for (const area of practiceAreas) {
      const slug = slugify(area);

      if (!practices.has(slug)) {
        practices.set(slug, {
          name: area,
          advocates: []
        });
      }

      practices.get(slug).advocates.push(advocate);
    }

    // INDIVIDUAL ADVOCATE PROFILE
    if (name) {
      const advocateSlug = slugify(name);
      const route = `advocate/${advocateSlug}`;
      const canonical = `${SITE_URL}/${route}/`;

      const description =
        `${name} - Advocate available through Instant Legal Services. ` +
        `View advocate profile, court, district, state and practice information.`;

      const photo = getValue(advocate, [
        "photo_url",
        "profile_photo",
        "image_url"
      ]);

      const advocateSchema = {
        "@context": "https://schema.org",
        "@type": "Person",
        "name": name,
        "jobTitle": "Advocate",
        "url": canonical,
        ...(photo ? { image: photo } : {}),
        "worksFor": {
          "@type": "Organization",
          "name": "Instant Legal Services",
          "url": SITE_URL
        }
      };

      const content = `
<div class="card">
${photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(name)}" style="max-width:180px;border-radius:10px">` : ""}
<h2>${escapeHtml(name)}</h2>
${court ? `<p><strong>Court:</strong> ${escapeHtml(court)}</p>` : ""}
${district ? `<p><strong>District:</strong> ${escapeHtml(district)}</p>` : ""}
${state ? `<p><strong>State:</strong> ${escapeHtml(state)}</p>` : ""}
${practiceAreas.length ? `<p><strong>Practice Areas:</strong> ${escapeHtml(practiceAreas.join(", "))}</p>` : ""}
</div>`;

      writePage(
        route,
        pageTemplate({
          title: `${name} | Advocate | Instant Legal Services`,
          description,
          canonical,
          heading: `${name} - Advocate`,
          content,
          schema: advocateSchema
        })
      );
    }
  }

  // STATE PAGES
  for (const [slug, data] of states) {
    const route = `state/${slug}`;
    const canonical = `${SITE_URL}/${route}/`;

    const content = data.advocates.map(a => {
      const name = getValue(a, ["advocate_name", "name", "full_name"]);
      return `<div class="card"><strong>${escapeHtml(name)}</strong></div>`;
    }).join("");

    writePage(route, pageTemplate({
      title: `Advocates in ${data.name} | Instant Legal Services`,
      description: `Find approved public advocates and legal services in ${data.name}.`,
      canonical,
      heading: `Advocates in ${data.name}`,
      content,
      schema: {
        "@context": "https://schema.org",
        "@type": "LegalService",
        "name": `Legal Services in ${data.name}`,
        "url": canonical,
        "areaServed": data.name
      }
    }));
  }

  // DISTRICT PAGES
  for (const [slug, data] of districts) {
    const route = `district/${slug}`;
    const canonical = `${SITE_URL}/${route}/`;

    writePage(route, pageTemplate({
      title: `Advocates in ${data.name} | Lawyers & Legal Services`,
      description: `Find approved public advocates, lawyers and legal services in ${data.name}${data.state ? `, ${data.state}` : ""}.`,
      canonical,
      heading: `Advocates in ${data.name}`,
      content: data.advocates.map(a => {
        const name = getValue(a, ["advocate_name", "name", "full_name"]);
        return `<div class="card">${escapeHtml(name)}</div>`;
      }).join(""),
      schema: {
        "@context": "https://schema.org",
        "@type": "LegalService",
        "name": `Legal Services in ${data.name}`,
        "url": canonical,
        "areaServed": data.name
      }
    }));
  }

  // COURT PAGES
  for (const [slug, data] of courts) {
    const route = `court/${slug}`;
    const canonical = `${SITE_URL}/${route}/`;

    writePage(route, pageTemplate({
      title: `Advocates at ${data.name} | Instant Legal Services`,
      description: `Find approved public advocates associated with ${data.name}.`,
      canonical,
      heading: `Advocates at ${data.name}`,
      content: data.advocates.map(a => {
        const name = getValue(a, ["advocate_name", "name", "full_name"]);
        return `<div class="card">${escapeHtml(name)}</div>`;
      }).join(""),
      schema: {
        "@context": "https://schema.org",
        "@type": "LegalService",
        "name": `Legal Services - ${data.name}`,
        "url": canonical,
        "areaServed": data.name
      }
    }));
  }

  // PRACTICE AREA PAGES
  for (const [slug, data] of practices) {
    const route = `practice/${slug}`;
    const canonical = `${SITE_URL}/${route}/`;

    writePage(route, pageTemplate({
      title: `${data.name} Advocates | Instant Legal Services`,
      description: `Find approved public advocates for ${data.name} matters across India.`,
      canonical,
      heading: `${data.name} Advocates`,
      content: data.advocates.map(a => {
        const name = getValue(a, ["advocate_name", "name", "full_name"]);
        return `<div class="card">${escapeHtml(name)}</div>`;
      }).join(""),
      schema: {
        "@context": "https://schema.org",
        "@type": "LegalService",
        "name": `${data.name} Legal Services`,
        "url": canonical,
        "areaServed": "India"
      }
    }));
  }

  console.log("SEO pages generated successfully.");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
