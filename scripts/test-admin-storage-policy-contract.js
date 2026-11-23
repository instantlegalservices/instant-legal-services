"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const migration = fs.readFileSync(
  "supabase/migrations/20261123180000_harden_admin_storage_identity.sql",
  "utf8"
);

assert.ok(migration.includes("public.ils_is_admin()"));
assert.ok(migration.includes("public.ils_admin_save_lead_multi(bigint,text,text,text,jsonb,boolean,date,text)"));
assert.ok(migration.includes("Reviewed ils_admin_save_lead_multi source mismatch"));
assert.ok(migration.includes("if not public.ils_is_admin() then"));
assert.ok(migration.includes('DROP POLICY IF EXISTS "Admin can move advocate photos"'));
assert.ok(migration.includes('DROP POLICY IF EXISTS "Admin can read advocate photos"'));
assert.ok(migration.includes('DROP POLICY IF EXISTS "Admin can view advocate photos"'));
assert.ok(migration.includes('DROP POLICY IF EXISTS "Public can upload advocate photos"'));
assert.ok(migration.includes("bucket_id = 'advocate-photo-pending'") && migration.includes("AND public.ils_is_admin()"));
assert.ok(migration.includes("bucket_id = 'advocate-photo'") && migration.includes("AND public.ils_is_admin()"));
assert.ok(migration.includes("bucket_id = 'client-matter-documents'") && migration.includes("AND public.ils_is_admin()"));
assert.ok(migration.includes("ils_public_approved_advocate_photo_read"));
assert.ok(migration.includes("ils_public_advocate_pending_insert"));
assert.ok(migration.includes("Legacy overbroad advocate-photo policy remains active"));
assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM|UPDATE public\./i);
console.log("ADMIN_STORAGE_IDENTITY_CONTRACT=PASS");
