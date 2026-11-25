"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const migration = fs.readFileSync(
  "supabase/migrations/20261123180000_harden_admin_storage_identity.sql",
  "utf8"
);

assert.ok(migration.includes("public.ils_is_admin()"));
for (const signature of [
  "public.get_admin_client_portal(bigint)",
  "public.admin_send_client_message(bigint,text)",
  "public.ils_admin_save_lead(bigint,text,text,text,bigint,boolean,date,text)",
  "public.ils_admin_save_lead_multi(bigint,text,text,text,jsonb,boolean,date,text)"
]) assert.ok(migration.includes(signature), "admin RPC signature missing: " + signature);
assert.ok(migration.includes("Skipping absent TEST-baseline admin RPC"));
assert.ok(migration.includes("Reviewed admin RPC source mismatch"));
assert.ok(migration.includes("if not public.ils_is_admin() then"));
assert.ok(migration.includes("IF NOT public.ils_is_admin() THEN"));
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

const edgeSource = fs.readFileSync(
  "supabase/functions/create-advocate-user/index.ts",
  "utf8"
);
assert.ok(edgeSource.includes('.from("ils_admin_users")'));
assert.ok(edgeSource.includes('.eq("user_id", userData.user.id)'));
assert.ok(edgeSource.includes("if (adminIdentityError || !adminIdentity)"));
assert.ok(!edgeSource.includes("fahat29@gmail.com"));
assert.ok(!edgeSource.includes("callerEmail"));

console.log("ADMIN_STORAGE_IDENTITY_CONTRACT=PASS");
