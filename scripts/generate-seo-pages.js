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
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function arrayValue(value) {
  if (Array.isArray(value)) {
    return value
      .map(v => String(v).trim())
      .filter(Boolean);
  }

  if (!value) return [];

  if (typeof value === "string") {
    return value
      .split(/\s*,\s*|\s*\|\s*|\s*;\s*|\n/)
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

function parseDistrictCourt(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return {
      district: "",
      court: ""
    };
  }

  const districtMatch = raw.match(
    /(?:^|\|)\s*District\s*:\s*([^|]+)/i
  );

  const courtMatch = raw.match(
    /(?:^|\|)\s*Court\s*:\s*([^|]+)/i
  );

  if (districtMatch || courtMatch) {
    return {
      district: districtMatch ? districtMatch[1].trim() : "",
      court: courtMatch ? courtMatch[1].trim() : ""
    };
  }

  const parts = raw
    .split(/\s*\|\s*/)
    .map(v => v.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return {
      district: parts[0],
      court: parts.slice(1).join(" | ")
    };
  }

  return {
    district: raw,
    court: ""
  };
}

function isTruthyPublicFlag(value) {
  return (
    value === true ||
    value === 1 ||
    String(value).trim().toLowerCase() === "true" ||
    String(value).trim() === "1"
  );
}

function uniqueStrings(values) {
  return [...new Set(
    values
      .map(value => String(value || "").trim())
      .filter(Boolean)
  )];
}

// VERIFIED OFFICIAL GOVERNMENT ROUTES.
// These are navigation references only. ILS is not the government portal,
// does not collect government credentials, and does not replace the official service.
const GOVERNMENT_SERVICES = [
  {
    slug: "up-jansunwai",
    title: "UP Jansunwai – Samadhan",
    category: "Uttar Pradesh Government",
    description: "Official Uttar Pradesh grievance registration, status tracking, reminder and feedback route.",
    officialUrl: "https://jansunwai.up.nic.in/"
  },
  {
    slug: "up-property-registration",
    title: "UP Property Registration – IGRSUP",
    category: "Uttar Pradesh Government",
    description: "Official Uttar Pradesh Stamp and Registration Department route for property registration and related services.",
    officialUrl: "https://igrsup.gov.in/"
  },
  {
    slug: "ecourts-case-status",
    title: "eCourts Case Status",
    category: "Government of India",
    description: "Official eCourts case-status search route for Indian courts.",
    officialUrl: "https://services.ecourts.gov.in/ecourtindia_v6/casestatus/"
  },
  {
    slug: "cyber-crime-reporting",
    title: "National Cyber Crime Reporting Portal",
    category: "Government of India",
    description: "Official route for reporting cyber crime; financial cyber fraud should be reported immediately through the official 1930 route.",
    officialUrl: "https://www.cybercrime.gov.in/"
  },
  {
    slug: "echallan",
    title: "eChallan – Digital Traffic/Transport Enforcement",
    category: "Government of India",
    description: "Official eChallan route for traffic and transport enforcement services.",
    officialUrl: "https://echallan.parivahan.nic.in/login"
  },
  {
    slug: "cpgrams-grievance",
    title: "CPGRAMS Public Grievance",
    category: "Government of India",
    description: "Official Centralised Public Grievance Redress and Monitoring System for government-service grievances.",
    officialUrl: "https://pgportal.gov.in/"
  },
  {
    slug: "consumer-helpline",
    title: "National Consumer Helpline",
    category: "Government of India",
    description: "Official National Consumer Helpline route for consumer grievances and tracking.",
    officialUrl: "https://consumerhelpline.gov.in/"
  },
  {
    slug: "udyam-registration",
    title: "Udyam Registration",
    category: "Government of India",
    description: "Official Ministry of MSME Udyam Registration portal. Registration is handled through the official government route.",
    officialUrl: "https://udyamregistration.gov.in/"
  },
  {
    slug: "income-tax-e-filing",
    title: "Income Tax e-Filing",
    category: "Government of India",
    description: "Official Income Tax Department e-Filing portal for tax filing and related online services.",
    officialUrl: "https://www.incometax.gov.in/iec/foportal/"
  },
  {
    slug: "mca-services",
    title: "MCA21 – Ministry of Corporate Affairs",
    category: "Government of India",
    description: "Official Ministry of Corporate Affairs portal for company and LLP related online services and filings.",
    officialUrl: "https://www.mca.gov.in/"
  },
  {
    slug: "epfo-services",
    title: "EPFO Services",
    category: "Government of India",
    description: "Official Employees' Provident Fund Organisation information and member-service route.",
    officialUrl: "https://www.epfindia.gov.in/"
  },
  {
    slug: "epfigms-grievance",
    title: "EPFiGMS Grievance",
    category: "Government of India",
    description: "Official EPFO grievance-management route for members, pensioners, employers and other users.",
    officialUrl: "https://epfigms.gov.in/"
  },
  {
    slug: "rbi-complaint-management",
    title: "RBI Complaint Management System",
    category: "Reserve Bank of India",
    description: "Official RBI complaint route for eligible complaints against regulated entities.",
    officialUrl: "https://cms.rbi.org.in/"
  },
  {
    slug: "gst-portal",
    title: "GST Portal",
    category: "Government of India",
    description: "Official GST portal for GST services, filings, notices and taxpayer workflows.",
    officialUrl: "https://www.gst.gov.in/"
  }
];

function governmentPageContent(service) {
  const verifiedDate = new Date().toISOString().slice(0, 10);

  return `
<div class="card">
  <p><strong>Official category:</strong> ${escapeHtml(service.category)}</p>
  <p>${escapeHtml(service.description)}</p>

  <div class="card" style="background:#fafafa">
    <h2>Official Government Route</h2>
    <p>
      <a href="${escapeHtml(service.officialUrl)}"
         target="_blank"
         rel="noopener noreferrer">
        Open ${escapeHtml(service.title)} ↗
      </a>
    </p>
    <p><small>Official source checked during page generation: ${escapeHtml(verifiedDate)}</small></p>
  </div>

  <div class="card">
    <h2>How ILS fits</h2>
    <p>
      ILS is an independent information and assistance platform. The official
      government portal remains the authoritative route for government
      applications, logins, payments, submissions and decisions.
    </p>
    <p>
      Where permitted, ILS may help users understand the official route,
      organise information or provide non-legal digital/administrative
      assistance. Legal judgment, drafting, strategy or representation is
      handled separately by an appropriate independent professional.
    </p>
  </div>

  <div class="card">
    <h2>Important safety rule</h2>
    <p>
      Do not share OTPs, passwords, Aadhaar details, payment credentials or
      other sensitive authentication information with ILS or any third party.
      Use the official government portal for sensitive authentication and
      payment steps.
    </p>
  </div>

  <p><a href="${SITE_URL}/government/">← Government Services Navigator</a></p>
</div>`;
}

function writeGovernmentPages() {
  const route = "government";
  const canonical = `${SITE_URL}/${route}/`;

  const cards = GOVERNMENT_SERVICES.map(service => `
<div class="card">
  <h2><a href="${SITE_URL}/government/${escapeHtml(service.slug)}/">${escapeHtml(service.title)}</a></h2>
  <p>${escapeHtml(service.description)}</p>
  <p><small>${escapeHtml(service.category)}</small></p>
</div>`).join("");

  writePage(route, pageTemplate({
    title: "Government Services Navigator | Official Government Portals | Instant Legal Services",
    description: "Find verified links to selected official government services, understand the route and use ILS assistance where permitted.",
    canonical,
    heading: "Government Services Navigator",
    content: `
<p>
  Find verified official government routes and useful guidance in one place.
  ILS does not operate, replace or impersonate government portals.
</p>
${cards}
<p><strong>Source rule:</strong> Government fees, eligibility, processing and final decisions remain with the relevant official authority.</p>`,
    schema: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": "Government Services Navigator",
      "url": canonical,
      "about": {
        "@type": "Thing",
        "name": "Official Government Services"
      }
    }
  }));

  for (const service of GOVERNMENT_SERVICES) {
    const serviceRoute = `government/${service.slug}`;
    const serviceCanonical = `${SITE_URL}/${serviceRoute}/`;

    writePage(serviceRoute, pageTemplate({
      title: `${service.title} | Official Government Route | Instant Legal Services`,
      description: `${service.description} Find the official route and understand how ILS can assist without replacing the government portal.`,
      canonical: serviceCanonical,
      heading: service.title,
      content: governmentPageContent(service),
      schema: {
        "@context": "https://schema.org",
        "@type": "Service",
        "name": `ILS Guide: ${service.title}`,
        "serviceType": "Official government route information and navigation",
        "url": serviceCanonical,
        "areaServed": service.category,
        "provider": {
          "@type": "Organization",
          "name": "Instant Legal Services",
          "url": SITE_URL
        },
        "sameAs": [service.officialUrl]
      }
    }));
  }
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
  const apiUrl = String(process.env.ADVOCATES_API_URL || "").trim();
  const apiKey = String(process.env.ADVOCATES_API_KEY || "").trim();

  if (!apiUrl) {
    throw new Error("ADVOCATES_API_URL is missing");
  }

  if (!apiKey) {
    throw new Error("ADVOCATES_API_KEY is missing");
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(apiUrl);
  } catch {
    throw new Error("ADVOCATES_API_URL is not a valid URL");
  }

  console.log(`Fetching advocates from ${parsedUrl.origin}${parsedUrl.pathname}`);

  const headers = new Headers();

  headers.set("Content-Type", "application/json");
  headers.set("apikey", apiKey);
  headers.set("Authorization", `Bearer ${apiKey}`);

  const response = await fetch(parsedUrl.toString(), {
    method: "GET",
    headers
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `API Error: ${response.status} ${response.statusText} - ${errorText.slice(0, 500)}`
    );
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error(
      `API response is not an array. Received: ${typeof data}`
    );
  }

  return data;
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
    ).trim().toLowerCase();

    const isPublic = getValue(advocate, [
      "public_profile",
      "is_public",
      "profile_public"
    ]);

    return status === "approved" && isTruthyPublicFlag(isPublic);
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
      "practice_state",
      "state",
      "state_name"
    ]);

    const districtCourt = getValue(advocate, [
      "district_court"
    ]);

    const parsedDistrictCourt = parseDistrictCourt(districtCourt);

    const district =
      getValue(advocate, [
        "district",
        "district_name",
        "city"
      ]) || parsedDistrictCourt.district;

    const court =
      getValue(advocate, [
        "court",
        "court_name"
      ]) || parsedDistrictCourt.court;

    const practiceAreas = uniqueStrings(
      arrayValue(
        getValue(advocate, [
          "primary_practice_area",
          "practice_areas",
          "practice_area",
          "specialization",
          "specialisations"
        ])
      )
    );

    const yearsOfPractice = getValue(advocate, [
      "years_of_practice"
    ]);

    const enrollmentNumber = getValue(advocate, [
      "enrollment_number"
    ]);

    const stateBarCouncil = getValue(advocate, [
      "state_bar_council"
    ]);

    const verificationStatus = getValue(advocate, [
      "verification_status",
      "status",
      "approval_status"
    ]);

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

      const locationParts = uniqueStrings([
        district,
        state
      ]);

      const descriptionParts = [
        `${name} - Advocate profile on Instant Legal Services`,
        locationParts.length ? `Location: ${locationParts.join(", ")}` : "",
        court ? `Court: ${court}` : "",
        practiceAreas.length ? `Practice areas: ${practiceAreas.slice(0, 4).join(", ")}` : ""
      ].filter(Boolean);

      const description = `${descriptionParts.join(". ")}.`;

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
        ...(practiceAreas.length ? { knowsAbout: practiceAreas } : {}),
        "memberOf": {
          "@type": "Organization",
          "name": "Instant Legal Services",
          "url": SITE_URL
        }
      };

      const content = `
<div class="card">
${photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(name)}" style="max-width:180px;border-radius:10px">` : ""}
<h2>${escapeHtml(name)}</h2>
<p><strong>Professional Profile:</strong> Approved public advocate profile.</p>
${enrollmentNumber ? `<p><strong>Enrollment / Registration:</strong> ${escapeHtml(enrollmentNumber)}</p>` : ""}
${stateBarCouncil ? `<p><strong>State Bar Council:</strong> ${escapeHtml(stateBarCouncil)}</p>` : ""}
${state ? `<p><strong>Practice State:</strong> ${escapeHtml(state)}</p>` : ""}
${district ? `<p><strong>District:</strong> ${escapeHtml(district)}</p>` : ""}
${court ? `<p><strong>Court / Jurisdiction:</strong> ${escapeHtml(court)}</p>` : ""}
${yearsOfPractice !== "" ? `<p><strong>Years of Practice:</strong> ${escapeHtml(yearsOfPractice)}</p>` : ""}
${verificationStatus ? `<p><strong>Verification Status:</strong> ${escapeHtml(verificationStatus)}</p>` : ""}
${practiceAreas.length ? `<div class="card"><h3>Practice Areas</h3><p>${escapeHtml(practiceAreas.join(", "))}</p></div>` : ""}
<div class="card">
  <p>This public professional profile is informational. It is not a ranking, guarantee of result, or government endorsement.</p>
</div>
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

  // GOVERNMENT / OFFICIAL ROUTE PAGES
  // Generated from a manually verified official-source registry.
  writeGovernmentPages();

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
