"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("supabase/functions/professional-portal/index.ts", "utf8");

assert.match(source, /async function resolveIdentityBoundProfile\(/,
  "professional portal must use a shared authenticated-identity resolver");
assert.match(source, /table:"advocate_registrations"\|"professional_join_requests"/,
  "both advocate and other professional registrations must use the same resolver");
assert.match(source, /\.from\(table\)[\s\S]*?\.eq\("auth_user_id",userId\)[\s\S]*?\.maybeSingle\(\)/,
  "the authenticated Supabase user ID must be queried first");
assert.match(source, /if\(linkedError\) throw linkedError;[\s\S]*?if\(linked\) return linked;/,
  "linked lookup errors must fail closed and a linked row must take precedence");
assert.match(source, /if\(!email\) return null;[\s\S]*?\.is\("auth_user_id",null\)[\s\S]*?\.ilike\("email",escapeLikePattern\(email\)\)/,
  "email fallback must be restricted to legacy profiles without an auth_user_id");
assert.match(source, /if\(legacyError\) throw legacyError;/,
  "legacy lookup errors must fail closed");
assert.doesNotMatch(source, /\.or\(/,
  "portal must not combine auth_user_id and email in one ambiguous OR query");
assert.match(source, /resolveIdentityBoundProfile\([\s\S]*?"advocate_registrations"/,
  "advocate registration lookup must use the strict resolver");
assert.match(source, /resolveIdentityBoundProfile\([\s\S]*?"professional_join_requests"/,
  "professional registration lookup must use the strict resolver");
assert.ok(source.includes("return value.replace(/[\\\\%_]/g,\"\\\\$&\");"),
  "email LIKE metacharacters must be escaped literally");
const escapeLikePattern = value => value.replace(/[\\%_]/g, "\\$&");
assert.equal(escapeLikePattern("user_name@example.com"), "user\\_name@example.com");
assert.equal(escapeLikePattern("user%name@example.com"), "user\\%name@example.com");
assert.equal(escapeLikePattern("user\\\\name@example.com"), "user\\\\\\\\name@example.com");


assert.match(source, /if\(adv\)\{\s*const a=adv;/,
  "the resolver returns one row, and the advocate response must consume that row directly");
assert.match(source, /if\(prof\)\{\s*const p=prof;/,
  "the resolver returns one row, and the professional response must consume that row directly");
assert.doesNotMatch(source, /if\((?:adv|prof)\?\.\[0\]\)/,
  "single-row resolver results must not be treated as arrays");
assert.equal((source.match(/async function resolveIdentityBoundProfile\(/g)||[]).length, 1,
  "the identity resolver must be defined exactly once");
assert.match(source, /async function loadAdvocateAssignments\(admin:any/,
  "assignment hydration helper must remain syntactically intact");
assert.doesNotMatch(source, /loadAdvocateAssignments\("\);/,
  "no malformed duplicate helper declaration may remain");

console.log("PROFESSIONAL_PORTAL_IDENTITY_CONTRACT=PASS");
