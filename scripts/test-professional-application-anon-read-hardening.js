import fs from "node:fs";
import assert from "node:assert/strict";

const migrationPath = "supabase/migrations/20261117183000_restrict_anon_professional_join_request_reads.sql";
const sql = fs.readFileSync(migrationPath, "utf8");

assert.match(sql, /REVOKE SELECT ON TABLE public\.professional_join_requests FROM anon, PUBLIC;/i);
assert.match(sql, /REVOKE SELECT \([\s\S]*aadhaar_hash[\s\S]*aadhaar_last4[\s\S]*admin_notes[\s\S]*auth_user_id[\s\S]*\) ON TABLE public\.professional_join_requests FROM anon, PUBLIC;/i);
assert.match(sql, /has_table_privilege\('anon', 'public\.professional_join_requests', 'SELECT'\)/i);
assert.match(sql, /has_column_privilege\('anon', 'public\.professional_join_requests', v_column, 'SELECT'\)/i);
assert.doesNotMatch(sql, /REVOKE\s+(?:ALL|INSERT|UPDATE|DELETE)\b/i);
assert.doesNotMatch(sql, /DROP\s+POLICY|CREATE\s+POLICY|ALTER\s+VIEW|DROP\s+VIEW/i);

console.log("Professional application anonymous-read hardening static checks passed.");
