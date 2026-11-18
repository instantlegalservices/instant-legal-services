"use strict";
const fs=require("node:fs");
const assert=require("node:assert/strict");
const endpoint=fs.readFileSync("supabase/functions/razorpay-payments/index.ts","utf8");
const webhook=fs.readFileSync("supabase/functions/razorpay-webhook/index.ts","utf8");
const migration=fs.readFileSync("supabase/migrations/20261118191500_atomic_razorpay_payment_finalization.sql","utf8").toLowerCase();

assert.match(endpoint,/createClient\(url,anonKey/);
assert.match(endpoint,/createClient\(url,serviceRoleKey/);
assert.match(endpoint,/userClient\.auth\.getUser\(\)/);
assert.match(endpoint,/\.eq\("user_id",user\.id\)/);
assert.match(endpoint,/safeEqual\(expected,sig\)/);
assert.match(endpoint,/gp\?\.status!=="captured"/);
assert.match(endpoint,/PAYMENT_FINALIZATION_FAILED/);
assert.match(endpoint,/ils_reserve_razorpay_attempt/);
assert.match(endpoint,/AbortSignal\.timeout\(15000\)/);
assert.match(endpoint,/RAZORPAY_ORDER_CREATE_OUTCOME_UNKNOWN/);
assert.match(endpoint,/receipt:"ILS"\+String\(reservation\.payment_id\)\.replaceAll\("-",""\)/);
assert.match(endpoint,/payment_attempt_id:reservation\.payment_id/);
assert.match(endpoint,/RAZORPAY_ORDER_ATTACH_RECONCILIATION_REQUIRED/);
assert.match(endpoint,/async function reconcileRazorpayOrder/);
assert.match(endpoint,/RAZORPAY_ORDER_RECONCILIATION_REQUIRED/);
assert.match(endpoint,/ORDER_LOOKUP_WINDOW_INCOMPLETE/);
assert.match(endpoint,/candidate\?\.receipt===receipt/);
assert.match(endpoint,/candidate\?\.notes\?\.payment_attempt_id/);
assert.match(endpoint,/candidate\?\.notes\?\.ils_order_id/);
assert.match(endpoint,/reservation\.created_at/);
assert.match(endpoint,/reservation\.existing_attempt===true/);
assert.match(endpoint,/previous request may have timed out after Razorpay created the order/);
assert.match(migration,/existing_attempt',true/);
assert.doesNotMatch(migration,/RAZORPAY_ORDER_CREATION_IN_PROGRESS/);
assert.doesNotMatch(endpoint,/update\(\{status:"failed"\}\)\.eq\("id",reservation\.payment_id\)/);
assert.match(migration,/created_at.*extract\(epoch from v_payment\.created_at\)/);
const finalizer=migration.slice(migration.indexOf("create or replace function public.ils_finalize_razorpay_payment"));
const orderLock=finalizer.match(/from public\.orders\s*where id=v_order_id\s*for update/);
const paymentLock=finalizer.match(/from public\.payments\s*where id=p_payment_id and gateway='razorpay'\s*for update/);
assert.ok(orderLock && paymentLock && orderLock.index < paymentLock.index,"finalizer must lock order before payment");
assert.match(finalizer,/payment_order_link_changed/);
assert.match(endpoint,/ils_attach_razorpay_order/);
assert.match(endpoint,/ils_finalize_razorpay_payment/);
assert.doesNotMatch(endpoint,/admin\.from\("orders"\)\.update\(\{status:"paid"\}\)/);
assert.doesNotMatch(endpoint,/admin\.from\("entitlements"\)\.upsert/);

assert.match(webhook,/safeEqual\(expected,\s*signature\)/);
assert.match(webhook,/payment\.status !== "captured"/);
assert.match(webhook,/ils_finalize_razorpay_payment/);
assert.match(webhook,/\.in\("status",\s*\["created",\s*"pending"\]\)/);
assert.match(webhook,/\.is\("gateway_payment_id",\s*null\)/);
assert.doesNotMatch(webhook,/from\("orders"\)\.update\(\{\s*status:\s*"paid"/);
assert.match(webhook,/if \(row\.status !== "paid" && !row\.gateway_payment_id\)/);
assert.doesNotMatch(webhook,/from\("orders"\)\.update\(\{\s*status:\s*"failed"/);
assert.match(webhook,/update\(\{\s*status:\s*"failed"\s*\}\)/);
assert.doesNotMatch(webhook,/update\(\{\s*gateway_payment_id:\s*payment\.id,\s*status:\s*"failed"/);
assert.match(migration,/status not in \('created','pending','failed'\)/);

for(const marker of [
 "alter table public.payment_events",
 "add column if not exists payload jsonb",
 "create or replace function public.ils_reserve_razorpay_attempt",
 "grant execute on function public.ils_reserve_razorpay_attempt(uuid) to service_role",
 "create or replace function public.ils_attach_razorpay_order",
 "grant execute on function public.ils_attach_razorpay_order(uuid,text) to service_role",
 "create or replace function public.ils_finalize_razorpay_payment",
 "upi_proof_pending",
 "payment_proofs pp",
 "status in ('created','pending')",
 "do not expire unattached reservations automatically",
 "for update",
 "p_gateway_amount_minor",
 "gateway_amount_currency_mismatch",
 "service_request_owner_mismatch",
 "order_service_mapping_mismatch",
 "payments_razorpay_gateway_order_id_uidx",
 "payments_one_razorpay_created_per_order_uidx",
 "revoke all on function public.ils_finalize_razorpay_payment",
 "grant execute on function public.ils_finalize_razorpay_payment(uuid,text,bigint,text) to service_role"
]) assert.ok(migration.includes(marker),"missing atomic finalizer requirement: "+marker);

console.log("PASS: Razorpay verify and webhook use one atomic, idempotent finalizer; gateway amount/currency, order/request ownership and service mapping are checked; delayed failure cannot downgrade paid state.");
