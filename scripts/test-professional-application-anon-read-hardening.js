import fs from "node:fs";
import assert from "node:assert/strict";

const migrationPath = "supabase/migrations/20261117183000_restrict_anon_professional_join_request_reads.sql";
const sql = fs.readFileSync(migrationPath, "utf8");

assert.match(sql, /REVOKE SELECT ON TABLE public\\.professional_join_requests FROM anon, PUBLIC;/i);
const columnRevoke = sql.match(/REVOKE SELECT \\(([\\s\\S]*?)\\) ON TABLE public\\.professional_join_requests FROM anon, PUBLIC;/i);
assert.ok(columnRevoke, "Expected explicit column-level SELECT revoke");
for (const column of ["aadhaar_hash", "aadhaar_last4", "admin_notes", "auth_user_id"]) {
  assert.match(columnRevoke[1], new RegExp(\\b${column}\\b, "i"), `Missing protected column in revoke: ${column}`);
}
assert.match(sql, /has_table_privilege\\('anon', 'public\\.professional_join_requests', 'SELECT'\\)/i);
assert.match(sql, /has_column_privilege\\('anon', 'public\\.professional_join_requests', v_column, 'SELECT'\\)/i);
assert.doesNotMatch(sql, /REVOKE\\s+(?:ALL|INSERT|UPDATE|DELETE)\\b/i);
assert.doesNotMatch(sql, /DROP\\s+POLICY|CREATE\\s+POLICY|ALTER\\s+VIEW|DROP\\s+VIEW/i);

console.log("Professional application anonymous-read hardening static checks passed.");
