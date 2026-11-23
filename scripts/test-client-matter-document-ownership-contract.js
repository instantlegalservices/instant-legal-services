"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const source = fs.readFileSync("supabase/functions/client-matter-documents/index.ts", "utf8");

assert.match(source, /async function isAdmin\(user: any\)[\s\S]*?if \(!user\?\.id\) return false[\s\S]*?from\("ils_admin_users"\)[\s\S]*?\.eq\("user_id", user\.id\)[\s\S]*?return !error && !!data/,
  "admin document access must be bound to an explicitly configured auth user ID");
assert.doesNotMatch(source, /user\?\.email\s*===\s*["']fahat29@gmail\.com["']/,
  "admin access must not rely on an email-only hardcoded identity");
assert.ok(source.includes("function escapeLikePattern(value: string) {"),
  "legacy email fallback must use a literal LIKE-pattern escaper");
assert.ok(source.includes('return value.replace(/[\\\\%_]/g, "\\\\$&");'),
  "LIKE metacharacters must be escaped before querying");
assert.ok(source.includes('.ilike("email", escapeLikePattern(String(user.email).trim()))'),
  "legacy email lookup must compare the supplied email literally");
assert.match(source, /async function getAssignedAdvocate\(user: any, clientId: number\)/,
  "document authorization must resolve the authenticated advocate server-side");
assert.match(source, /\.eq\("auth_user_id", user\.id\)[\s\S]*?if \(advocate\) \{[\s\S]*?advocate\.status[\s\S]*?advocate\.verification_status[\s\S]*?if \(!approved\) return null/,
  "linked identity must be checked first and an unapproved linked profile must fail closed");
assert.match(source, /else if \(user\.email\) \{[\s\S]*?\.is\("auth_user_id", null\)[\s\S]*?\.ilike\("email", escapeLikePattern\(String\(user\.email\)\.trim\(\)\)\)[\s\S]*?\.ilike\("status", "Approved"\)[\s\S]*?\.ilike\("verification_status", "Approved"\)/,
  "email fallback must be restricted to unlinked legacy registrations and require both approvals");
assert.match(source, /\.eq\("lead_id", clientId\)[\s\S]*?\.eq\("advocate_id", advocate\.id\)[\s\S]*?\.in\("status", \["Assigned", "Active"\]\)/,
  "document access must require an active assignment for the resolved advocate");
assert.match(source, /if \(advocateError\) return null[\s\S]*?if \(legacy\.error\) return null[\s\S]*?if \(assignmentError \|\| !assignment\) return null/,
  "authorization lookup errors must fail closed");
assert.match(source, /const assignedAdvocate = await getAssignedAdvocate\(user, targetClient\.id\)/,
  "request authorization must use the strict identity resolver");
assert.match(source, /uploaderName = assignedAdvocate\?\.advocate_name \|\| "Assigned Advocate"/,
  "uploader attribution must use the already-authorized advocate identity");
const escapeLikePattern = value => value.replace(/[\\%_]/g, "\\console.log("CLIENT_MATTER_DOCUMENT_OWNERSHIP_CONTRACT=PASS");");
assert.equal(escapeLikePattern("user_name@example.com"), "user\\_name@example.com");
assert.equal(escapeLikePattern("user%name@example.com"), "user\\%name@example.com");
assert.equal(escapeLikePattern("user\\\\name@example.com"), "user\\\\\\\\name@example.com");

console.log("CLIENT_MATTER_DOCUMENT_OWNERSHIP_CONTRACT=PASS");
