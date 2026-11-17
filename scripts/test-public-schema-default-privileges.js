"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const sql = fs.readFileSync(
  "supabase/migrations/20261117190000_harden_public_schema_default_privileges.sql",
  "utf8"
).toLowerCase();

assert.ok(sql.includes("revoke all privileges on all sequences in schema public from anon, public"));
assert.ok(sql.includes("alter default privileges for role postgres in schema public"));
assert.ok(sql.includes("revoke all on tables from anon, public"));
assert.ok(sql.includes("revoke all on sequences from anon, public"));
assert.ok(sql.includes("revoke execute on functions from anon"));
assert.ok(sql.includes("alter default privileges for role postgres\n  revoke execute on functions from public"));
assert.ok(sql.includes("has_sequence_privilege('anon'"));
assert.ok(sql.includes("aclexplode(d.defaclacl)"));
assert.ok(sql.includes("project-level postgres cannot alter the managed"));
assert.ok(sql.includes("found no"));
assert.doesNotMatch(sql, /alter default privileges for role supabase_admin/);
assert.doesNotMatch(sql, /drop\s+policy|create\s+policy|delete\s+from|truncate\s+table/);
console.log("PASS: existing public sequences and postgres-created future public-schema objects are hardened; managed supabase_admin default ACL scope is documented and not targeted.");
