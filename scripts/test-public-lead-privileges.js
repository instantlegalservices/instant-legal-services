"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");

const path = "supabase/migrations/20261117181500_restrict_anon_client_requirement_insert_columns.sql";
const sql = fs.readFileSync(path, "utf8");
const normalized = sql.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").toLowerCase();

assert.match(normalized, /revoke all privileges on table public\.client_requirements from anon/);
assert.match(normalized, /grant insert \( client_name, legal_matter, brief_requirement, "souce", state, district_city, mobile \) on table public\.client_requirements to anon/);
assert.match(normalized, /revoke all privileges on sequence public\.client_requirements_id_seq from anon/);
assert.doesNotMatch(normalized, /grant insert on table public\.client_requirements to anon/);

for (const protectedColumn of [
  "status", "payment_status", "priority", "assigned_advocate",
  "assigned_advocate_id", "release_advocate_contact", "contact_released_at",
  "internal_notes", "client_access_token", "client_access_created_at",
  "client_access_expires_at"
]) {
  const grantClause = normalized.match(/grant insert \(([^)]*)\) on table public\.client_requirements to anon/);
  assert.ok(grantClause, "column-scoped anonymous INSERT grant must exist");
  assert.ok(!grantClause[1].split(",").map(x => x.trim()).includes(protectedColumn),
    "protected CRM field must not be writable by anon: " + protectedColumn);
}

console.log("PASS: anonymous lead INSERT is column-scoped; CRM/payment/assignment/private-access fields and direct identity-sequence privileges are not granted.");
