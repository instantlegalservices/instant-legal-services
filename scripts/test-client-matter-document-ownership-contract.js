"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const source = fs.readFileSync("supabase/functions/client-matter-documents/index.ts", "utf8");

assert.match(source, /async function getAssignedAdvocate\(user: any, clientId: number\)/,
  "document authorization must resolve the authenticated advocate server-side");
assert.match(source, /\.eq\("auth_user_id", user\.id\)[\s\S]*?\.ilike\("status", "Approved"\)[\s\S]*?\.ilike\("verification_status", "Approved"\)/,
  "linked advocate identity must require both approval states");
assert.match(source, /\.is\("auth_user_id", null\)[\s\S]*?\.ilike\("email", String\(user\.email\)\.trim\(\)\)[\s\S]*?\.ilike\("status", "Approved"\)[\s\S]*?\.ilike\("verification_status", "Approved"\)/,
  "email fallback must be restricted to unlinked legacy registrations and require both approvals");
assert.match(source, /\.eq\("lead_id", clientId\)[\s\S]*?\.eq\("advocate_id", advocate\.id\)[\s\S]*?\.in\("status", \["Assigned", "Active"\]\)/,
  "document access must require an active assignment for the resolved advocate");
assert.match(source, /if \(advocateError\) return null[\s\S]*?if \(legacy\.error\) return null[\s\S]*?if \(assignmentError \|\| !assignment\) return null/,
  "authorization lookup errors must fail closed");
assert.match(source, /const assignedAdvocate = await getAssignedAdvocate\(user, targetClient\.id\)/,
  "request authorization must use the strict identity resolver");
assert.match(source, /uploaderName = assignedAdvocate\?\.advocate_name \|\| "Assigned Advocate"/,
  "uploader attribution must use the already-authorized advocate identity");
console.log("CLIENT_MATTER_DOCUMENT_OWNERSHIP_CONTRACT=PASS");
