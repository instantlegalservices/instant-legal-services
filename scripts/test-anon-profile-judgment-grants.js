"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const sql = fs.readFileSync(
  "supabase/migrations/20261117185000_restrict_anon_profile_and_judgment_grants.sql",
  "utf8"
).toLowerCase();

const tables = [
  "advocate_registrations",
  "advocate_research_documents",
  "customer_profiles",
  "judgments",
  "tool_runs"
];
for (const table of tables) assert.ok(sql.includes("'" + table + "'"), "missing target: " + table);
assert.ok(sql.includes("revoke all privileges on table public.%i from anon, public"));
assert.ok(sql.includes("grant select on table public.%i to anon"));
assert.ok(sql.includes("grant insert on table public.%i to anon"));
assert.ok(sql.includes("v_expected_select := (v_table = 'judgments')"));
assert.ok(sql.includes("v_expected_insert := (v_table = 'advocate_registrations')"));
assert.ok(sql.includes("has_table_privilege('anon', v_relation, 'select')"));
assert.ok(sql.includes("has_table_privilege('anon', v_relation, 'insert')"));
assert.ok(sql.includes("'truncate'"));
assert.ok(sql.includes("verified + completed"));
assert.doesNotMatch(sql, /drop\s+policy|create\s+policy|disable\s+row\s+level\s+security|delete\s+from|truncate\s+table/);
console.log("PASS: anonymous privileges are narrowed to public advocate INSERT and verified/completed judgment SELECT; private profile/research/tool tables are closed.");
