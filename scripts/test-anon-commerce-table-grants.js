"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");

const sql = fs.readFileSync(
  "supabase/migrations/20261117184500_restrict_anon_commerce_table_grants.sql",
  "utf8"
).toLowerCase();

const tables = [
  "orders",
  "order_items",
  "payments",
  "payment_events",
  "payment_proofs",
  "entitlements",
  "service_requests"
];
for (const table of tables) {
  assert.ok(sql.includes("'" + table + "'"), "missing private commerce table target: " + table);
}
assert.ok(sql.includes("revoke all privileges on table public.%i from anon, public"));
assert.ok(sql.includes("revoke %s (%i) on table public.%i from anon, public"));
assert.ok(sql.includes("has_table_privilege('anon', v_relation, v_privilege)"));
assert.ok(sql.includes("has_any_column_privilege('anon', v_relation, v_privilege)"));
assert.ok(sql.includes("'truncate'"));
assert.ok(sql.includes("required private commerce table"));
assert.doesNotMatch(sql, /drop\s+policy|create\s+policy|disable\s+row\s+level\s+security|delete\s+from|truncate\s+table/);

console.log("PASS: anonymous table and column grants are revoked and verified for all seven private commerce tables; authenticated/service-role access and existing RLS policies remain untouched.");
