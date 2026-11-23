"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");

const migration = fs.readFileSync(
  "supabase/migrations/20261123200000_harden_professional_member_context_identity.sql",
  "utf8"
);
const sqlTest = fs.readFileSync("scripts/test-professional-member-context-identity.sql", "utf8");

assert.match(migration, /create or replace function public\.ils_professional_member_context\(\)/i);
assert.match(migration, /set search_path\s*=\s*''/i);
assert.match(migration, /has_linked_professional_profile/);
assert.match(migration, /has_linked_advocate_profile/);
assert.match(migration, /p\.auth_user_id\s*=\s*uid/);
assert.match(migration, /p\.auth_user_id\s+is\s+null[\s\S]*?lower\(p\.email\)/i);
assert.match(migration, /ar\.auth_user_id\s*=\s*uid/);
assert.match(migration, /ar\.auth_user_id\s+is\s+null[\s\S]*?lower\(ar\.email\)/i);
assert.match(migration, /not in \('rejected', 'cancelled'\)/i);
assert.match(migration, /grant execute on function public\.ils_professional_member_context\(\) to authenticated, service_role/i);
assert.doesNotMatch(migration, /auth_user_id\s*=\s*uid\s+or\s+lower\(/i);
assert.match(sqlTest, /linked identity must win over newer same-email legacy profile/i);
assert.match(sqlTest, /rejected linked advocate profile must block legacy email fallback/i);
assert.match(sqlTest, /pending linked advocate registration must remain eligible/i);
assert.match(sqlTest, /app_metadata alone cannot grant membership/i);

console.log("ILS_PROFESSIONAL_MEMBER_CONTEXT_IDENTITY=PASS");
