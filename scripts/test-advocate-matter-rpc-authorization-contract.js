"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");

const migration = fs.readFileSync(
  "supabase/migrations/20261123170000_harden_advocate_matter_rpc_identity.sql",
  "utf8"
);

assert.match(migration, /required relation % is missing/);
assert.match(migration, /get_advocate_client_portal\(bigint\)/);
assert.match(migration, /advocate_send_client_message\(bigint,text\)/);
assert.match(migration, /advocate_add_work_progress\(bigint,text,text,text,boolean,date,date,date\)/);
assert.match(migration, /RETURNS public\.advocate_registrations[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/);
assert.match(migration, /auth_user_id = v_user_id/);
assert.match(migration, /v_linked_count > 1/);
assert.match(migration, /v_linked_count = 1/);
assert.match(migration, /ar\.auth_user_id IS NULL[\s\S]*?ar\.email/);
assert.match(migration, /v_legacy_count <> 1/);
assert.match(migration, /v_advocate\.status[\s\S]*?v_advocate\.verification_status/);
assert.match(migration, /lower\(btrim\(coalesce\(v_advocate\.status, ''\)\)\) <> 'approved'[\s\S]*?lower\(btrim\(coalesce\(v_advocate\.verification_status, ''\)\)\) <> 'approved'/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.ils_current_approved_advocate\(\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/);
assert.ok(
  migration.includes("DO $helper_acl$") &&
  migration.includes("pg_get_userbyid(p.proowner)") &&
  migration.includes("GRANT EXECUTE ON FUNCTION public.ils_current_approved_advocate() TO %I"),
  "internal resolver EXECUTE must be granted only to trusted RPC owners"
);
assert.match(migration, /One or more SECURITY DEFINER RPC owners cannot execute the internal resolver/);
assert.match(migration, /Reviewed identity block mismatch/);
assert.match(migration, /Reviewed active-assignment ownership check missing/);
assert.match(migration, /public\.advocate_assignments/);
assert.match(migration, /position\('v_email' in v_definition\) > 0/);
assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM|UPDATE public\./i);
assert.match(migration, /SET search_path TO/);
assert.match(migration, /has_function_privilege\('authenticated'/);
assert.match(migration, /has_function_privilege\('service_role'/);
assert.match(migration, /has_function_privilege\('anon'/);

const signatures = [
  "public.get_advocate_client_portal(bigint)",
  "public.advocate_send_client_message(bigint,text)",
  "public.advocate_add_work_progress(bigint,text,text,text,boolean,date,date,date)"
];
assert.equal((migration.match(/public\.ils_current_approved_advocate\(\)/g) || []).length >= 4, true);
assert.equal(signatures.length, 3);

// Executable policy model for linked identity precedence, dual approval, and fail-closed
// duplicate handling. The SQL migration is separately checked above.
function resolve(rows, userId, email) {
  if (!userId) return null;
  const linked = rows.filter(row => row.auth_user_id === userId);
  if (linked.length > 1) return null;
  let candidate;
  if (linked.length === 1) {
    candidate = linked[0];
  } else {
    const legacy = rows.filter(row =>
      row.auth_user_id == null &&
      String(row.email || "").trim().toLowerCase() === String(email || "").trim().toLowerCase()
    );
    if (legacy.length !== 1) return null;
    candidate = legacy[0];
  }
  return String(candidate.status || "").trim().toLowerCase() === "approved" &&
    String(candidate.verification_status || "").trim().toLowerCase() === "approved"
    ? candidate : null;
}

const a = { id: 1, auth_user_id: "user-a", email: "same@example.test", status: "Approved", verification_status: "Approved" };
const b = { id: 2, auth_user_id: "user-b", email: "b@example.test", status: "Approved", verification_status: "Approved" };
const legacyCollision = { id: 3, auth_user_id: null, email: "same@example.test", status: "Approved", verification_status: "Approved" };
assert.equal(resolve([a, legacyCollision], "user-a", "same@example.test").id, 1);
assert.equal(resolve([a, legacyCollision], "user-b", "b@example.test"), null);
assert.equal(resolve([legacyCollision], "user-legacy", "same@example.test").id, 3);
assert.equal(resolve([{ ...a, status: "Suspended" }], "user-a", "same@example.test"), null);
assert.equal(resolve([{ ...a, verification_status: "Pending" }], "user-a", "same@example.test"), null);
assert.equal(resolve([{ ...a, auth_user_id: null, status: "Suspended" }], "user-legacy", "same@example.test"), null);
assert.equal(resolve([a, { ...a, id: 4 }], "user-a", "same@example.test"), null);
assert.equal(resolve([legacyCollision, { ...legacyCollision, id: 5 }], "user-legacy", "same@example.test"), null);
assert.equal(resolve([a], null, "same@example.test"), null);

// Multiple active assignees remain supported: each assigned advocate can access the same
// matter, while an advocate with no active assignment cannot.
const assignments = [{ lead_id: 77, advocate_id: 1, status: "Assigned" }, { lead_id: 77, advocate_id: 2, status: "Active" }];
const canAccess = (advocateId, leadId) => assignments.some(x =>
  x.advocate_id === advocateId && x.lead_id === leadId && ["Assigned", "Active"].includes(x.status)
);
assert.equal(canAccess(1, 77), true);
assert.equal(canAccess(2, 77), true);
assert.equal(canAccess(3, 77), false);
assert.equal(canAccess(1, 78), false);

console.log("ADVOCATE_MATTER_RPC_AUTHORIZATION_CONTRACT=PASS");
