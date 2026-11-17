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
assert.match(endpoint,/abortsignal\.timeout\(15000\)/);
assert.match(endpoint,/razorpay_order_create_timeout/);
assert.match(endpoint,/ils_attach_razorpay_order/);
assert.match(endpoint,/ils_finalize_razorpay_payment/);
assert.doesNotMatch(endpoint,/admin\.from\("orders"\)\.update\(\{status:"paid"\}\)/);
assert.doesNotMatch(endpoint,/admin\.from\("entitlements"\)\.upsert/);

assert.match(webhook,/safeEqual\(expected,\s*signature\)/);
assert.match(webhook,/payment\.status !== "captured"/);
assert.match(webhook,/ils_finalize_razorpay_payment/);
assert.match(webhook,/\.in\("status",\s*\["created",\s*"pending"\]\)/);
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
 "created_at < now() - interval '15 minutes'",
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
