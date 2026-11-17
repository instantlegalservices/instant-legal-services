import fs from "node:fs";
import assert from "node:assert/strict";

const migrationPath = "supabase/migrations/20261117183000_restrict_anon_professional_join_request_reads.sql";
const sql = fs.readFileSync(migrationPath, "utf8");
const normalized = sql.toLowerCase();

assert.ok(normalized.includes("revoke select on table public.professional_join_requests from anon, public;"));
const start = normalized.indexOf("revoke select (");
const end = normalized.indexOf(") on table public.professional_join_requests from anon, public;", start);
assert.ok(start >= 0 && end > start, "Expected explicit column-level SELECT revoke");
const columnRevoke = normalized.slice(start, end);
for (const column of ["aadhaar_hash", "aadhaar_last4", "admin_notes", "auth_user_id"]) {
  assert.ok(columnRevoke.includes(column), "Missing protected column in revoke: " + column);
}
assert.ok(normalized.includes("has_table_privilege('anon', 'public.professional_join_requests', 'select')"));
assert.ok(normalized.includes("has_column_privilege('anon', 'public.professional_join_requests', v_column, 'select')"));
assert.doesNotMatch(normalized, /revoke\s+(?:all|insert|update|delete)\b/);
assert.doesNotMatch(normalized, /drop\s+policy|create\s+policy|alter\s+view|drop\s+view/);

console.log("Professional application anonymous-read hardening static checks passed.");
