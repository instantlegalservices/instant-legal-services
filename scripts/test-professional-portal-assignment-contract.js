"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");

const edge = fs.readFileSync("supabase/functions/professional-portal/index.ts", "utf8");
const portal = fs.readFileSync("portal.html", "utf8");

assert.match(edge, /async function loadAdvocateAssignments\(/,
  "professional portal must have a server-side assignment loader");
assert.match(edge, /String\(status\|\|""\)[\s\S]*?toLowerCase\(\)==="approved"[\s\S]*?String\(verificationStatus\|\|""\)[\s\S]*?toLowerCase\(\)==="approved"/,
  "assignment data must be withheld unless both advocate status and verification are approved");
assert.match(edge, /\.from\("advocate_assignments"\)[\s\S]*?\.select\("lead_id,status,assigned_at"\)[\s\S]*?\.eq\("advocate_id",advocateId\)[\s\S]*?\.in\("status",\["Assigned","Active"\]\)/,
  "assignment lookup must be scoped to the authenticated advocate and active assignment states");
assert.match(edge, /\.from\("client_requirements"\)[\s\S]*?\.select\("id,client_name,legal_matter,state,district_city,brief_requirement"\)[\s\S]*?\.in\("id",leadIds\)/,
  "client lookup must be limited to assigned lead IDs and minimum portal display fields");
assert.doesNotMatch(edge, /select\("id,client_name,legal_matter,state,district_city,brief_requirement,mobile/,
  "assignment hydration must not add client mobile to the portal response");
assert.match(edge, /assignment_id:assignment.id[\\s\\S]*?client_can_see_contact:assignment.client_can_see_contact===true[\\s\\S]*?client:lead/,
  "assignment response must preserve deployed metadata and full matter object shape");
assert.doesNotMatch(edge, /\\.eq\\("assigned_advocate_id",a\\.id\\)/,
  "multi-assignee rows must not be filtered by the single primary advocate pointer");
assert.match(edge, /const assignments=await loadAdvocateAssignments\([\s\S]*?return json\(\{[\s\S]*?role:"advocate",[\s\S]*?assignments,/,
  "advocate response must expose the assignments property expected by portal.html");
assert.match(portal, /Array\.isArray\(p\.assignments\)\?p\.assignments:\[\]/,
  "portal must continue consuming the established assignments response contract");
assert.match(portal, /c\.client_name[\s\S]*?c\.legal_matter[\s\S]*?c\.state[\s\S]*?c\.district_city[\s\S]*?c\.brief_requirement/,
  "returned assignment client fields must satisfy the existing portal renderer");

console.log("PROFESSIONAL_PORTAL_ASSIGNMENT_CONTRACT=PASS");
