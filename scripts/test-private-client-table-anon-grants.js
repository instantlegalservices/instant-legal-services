"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");

const sql = fs.readFileSync(
  "supabase/migrations/20261117184000_restrict_anon_private_client_table_grants.sql",
  "utf8"
).toLowerCase();

const tables = [
  "advocate_assignments",
  "client_work_progress",
  "client_chat_messages",
  "client_matter_documents"
];
for (const table of tables) {
  assert.ok(sql.includes("'" + table + "'"), "missing private table target: " + table);
}
assert.ok(sql.includes("revoke all privileges on table public.%i from anon, public"));
assert.ok(sql.includes("revoke %s (%i) on table public.%i from anon, public"));
assert.ok(sql.includes("has_table_privilege('anon', v_relation, v_privilege)"));
assert.ok(sql.includes("has_any_column_privilege('anon', v_relation, v_privilege)"));
assert.ok(sql.includes("'truncate'"), "TRUNCATE privilege must be included in verification");
assert.ok(sql.includes("required private client table"), "migration must fail closed when a table is missing");
assert.ok(sql.includes("preserve authenticated and service_role grants"));
assert.doesNotMatch(sql, /drop\s+policy|create\s+policy|disable\s+row\s+level\s+security|delete\s+from|truncate\s+table/);

console.log("PASS: anonymous table and column grants are revoked and verified for all four private client tables; authenticated/service-role access and RLS policy definitions remain untouched.");
