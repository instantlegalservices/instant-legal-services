"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");

const portal = fs.readFileSync("supabase/migrations/20261117182000_harden_client_portal_advocate_disclosure.sql", "utf8");
const admin = fs.readFileSync("supabase/migrations/20261117182100_align_admin_crm_uuid_authorization.sql", "utf8");

assert.ok(portal.includes("'public.get_client_portal(text,text)'::regprocedure"));
assert.ok(portal.includes("regexp_matches(v_definition, v_mobile_pattern, 'g')"));
assert.ok(portal.includes("if v_mobile_count <> 2 then"));
const expectedMobilePattern = "v_mobile_pattern text := E'case\\\\s+when coalesce\\\\(\\\\s*c\\\\.release_advocate_contact,\\\\s*false\\\\s*\\\\)\\\\s*then ar\\\\.mobile\\\\s*else null\\\\s*end';";
assert.ok(portal.includes(expectedMobilePattern), "portal migration regex must retain valid PostgreSQL E-string escaping");
assert.ok(portal.includes("coalesce(aa.client_can_see_contact,false) then ar.mobile else null end"));
assert.ok(portal.includes("coalesce(ar.verification_status, ar.status, ''Pending'') = ''Approved''"));
assert.ok(portal.includes("refusing partial migration"));

assert.ok(admin.includes("ils_admin_save_lead(bigint,text,text,text,bigint,boolean,date,text)"));
assert.ok(admin.includes("ils_admin_save_lead_multi(bigint,text,text,text,jsonb,boolean,date,text)"));
assert.ok(admin.includes("if not public.ils_is_admin() then"));
assert.ok(admin.includes("Expected exactly one legacy email guard"));

console.log("PASS: portal advocate disclosure is assignment-scoped and approved-only; regex escaping is pinned; Admin CRM RPC migration targets both UUID allow-list checks with fail-closed guards.");
