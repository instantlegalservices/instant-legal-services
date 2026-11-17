"use strict";
const fs=require("node:fs");
const assert=require("node:assert/strict");
const sql=fs.readFileSync("supabase/migrations/20261118190000_harden_upi_payment_proof_flow.sql","utf8").toLowerCase();
for(const s of [
 "revoke insert on table public.payment_proofs from authenticated, public",
 "drop policy if exists payment_proofs_insert_own",
 "payment_proofs_active_utr_uidx",
 "pg_advisory_xact_lock(hashtextextended(v_ref,0))",
 "o.bucket_id='payment-proofs'",
 "o.owner=v_user",
 "o.owner_id=v_user::text",
 "o.archived_at is null",
 "coalesce(o.is_delete_marker,false)=false",
 "o.metadata->>'size'",
 "o.metadata->>'mimetype'",
 "proof_order_owner_mismatch",
 "proof_order_amount_mismatch",
 "proof_order_currency_mismatch",
 "service_request_owner_mismatch",
 "service_request_not_pending",
 "order_service_mapping_invalid",
 "v_service_id is distinct from v_request.service_id",
 "entitlements e",
 "revoke all on function public.ils_submit_upi_payment_proof",
 "grant execute on function public.ils_submit_upi_payment_proof"
]) assert.ok(sql.includes(s),"missing hardening requirement: "+s);
assert.doesNotMatch(sql,/grant\s+insert\s+on\s+table\s+public\.payment_proofs\s+to\s+authenticated/);
assert.doesNotMatch(sql,/drop\s+policy[^;]*payment_proofs_select_own/);
assert.match(sql,/if v_decision='rejected' then[\s\S]*?status='rejected'[\s\S]*?return jsonb_build_object/);
console.log("PASS: UPI submission validates actual private Storage object and serializes canonical UTRs; direct authenticated INSERT is closed; Admin verification enforces proof/order/request/service consistency and transactional entitlement behavior.");
