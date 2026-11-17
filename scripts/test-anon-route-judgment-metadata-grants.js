"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const sql = fs.readFileSync(
  "supabase/migrations/20261117185500_restrict_anon_route_and_judgment_metadata_grants.sql",
  "utf8"
).toLowerCase();

const targets = [
  "ils_action_assistance_queue",
  "ils_government_route_catalog",
  "judgment_fetch_logs",
  "judgment_sources",
  "professional_join_requests",
  "services",
  "service_prices",
  "tool_catalog"
];
for (const table of targets) assert.ok(sql.includes("'" + table + "'"), "missing target: " + table);
for (const table of ["ils_government_route_catalog","services","service_prices","tool_catalog"]) {
  assert.ok(sql.includes("'" + table + "'"), "public read target missing: " + table);
}
assert.ok(sql.includes("revoke all privileges on table public.%i from anon, public"));
assert.ok(sql.includes("grant select on table public.%i to anon"));
assert.ok(sql.includes("v_public_select := v_table in"));
assert.ok(sql.includes("has_table_privilege('anon', v_relation, 'select')"));
assert.ok(sql.includes("'truncate'"));
assert.ok(sql.includes("has_any_column_privilege"));
assert.doesNotMatch(sql, /drop\s+policy|create\s+policy|disable\s+row\s+level\s+security|delete\s+from|truncate\s+table/);
console.log("PASS: only active public catalogue SELECT is retained; private queue, judgment metadata and professional application tables have no anon privileges.");
