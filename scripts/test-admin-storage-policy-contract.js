"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const migration = fs.readFileSync(
  "supabase/migrations/20261123180000_harden_admin_storage_identity.sql",
  "utf8"
);

assert.match(migration, /public\\.ils_is_admin\\(\\)/);
assert.match(migration, /ils_admin_save_lead_multi\\(bigint,text,text,text,jsonb,boolean,date,text\\)/);
assert.match(migration, /Reviewed ils_admin_save_lead_multi source mismatch/);
assert.match(migration, /if not public\\.ils_is_admin\\(\\) then/);
assert.match(migration, /DROP POLICY IF EXISTS "Admin can move advocate photos"/);
assert.match(migration, /DROP POLICY IF EXISTS "Admin can read advocate photos"/);
assert.match(migration, /DROP POLICY IF EXISTS "Admin can view advocate photos"/);
assert.match(migration, /bucket_id = 'advocate-photo-pending'[\\s\\S]*?public\\.ils_is_admin\\(\\)/);
assert.match(migration, /bucket_id = 'advocate-photo'[\\s\\S]*?public\\.ils_is_admin\\(\\)/);
assert.match(migration, /bucket_id = 'client-matter-documents'[\\s\\S]*?public\\.ils_is_admin\\(\\)/);
assert.match(migration, /ils_public_approved_advocate_photo_read/);
assert.match(migration, /ils_public_advocate_pending_insert/);
assert.match(migration, /Legacy overbroad advocate-photo policy remains active/);
assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM|UPDATE public\\./i);
console.log("ADMIN_STORAGE_IDENTITY_CONTRACT=PASS");
