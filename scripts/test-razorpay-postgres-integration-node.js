"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const assert = require("node:assert/strict");

const pool = new Pool({ max: 10 });
const migration = fs.readFileSync(path.join("supabase/migrations","20261118191500_atomic_razorpay_payment_finalization.sql"),"utf8");
const U = {
  user: "11111111-1111-4111-8111-111111111111",
  service: "22222222-2222-4222-8222-222222222222",
  request: "33333333-3333-4333-8333-333333333333",
  order: "44444444-4444-4444-8444-444444444444",
  item: "55555555-5555-4555-8555-555555555555"
};
async function setup(){
  await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await pool.query("DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$");
  await pool.query("DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$");
  await pool.query("DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$");
  await pool.query(`CREATE TABLE public.orders(id uuid primary key default gen_random_uuid(), order_number text not null, user_id uuid, service_request_id uuid, total numeric not null, currency text not null default 'INR', status text not null default 'pending', created_at timestamptz not null default now())`);
  await pool.query(`CREATE TABLE public.payments(id uuid primary key default gen_random_uuid(), order_id uuid not null, gateway text not null, gateway_payment_id text, gateway_order_id text, amount numeric not null, currency text not null default 'INR', status text not null default 'created', paid_at timestamptz, created_at timestamptz not null default now())`);
  await pool.query(`CREATE TABLE public.payment_events(id uuid primary key default gen_random_uuid(),payment_id uuid not null,event_type text not null,data jsonb,created_at timestamptz not null default now())`);
  await pool.query(`CREATE TABLE public.payment_proofs(id uuid primary key default gen_random_uuid(),order_id uuid not null,user_id uuid not null,amount numeric not null,currency text not null default 'INR',upi_id text not null,transaction_ref text not null,payee_name_claimed text,screenshot_path text not null,screenshot_sha256 text not null,mime_type text not null,file_size_bytes integer not null,status text not null default 'pending',verification_notes text,submitted_at timestamptz not null default now(),verified_at timestamptz,verified_by uuid)`);
  await pool.query(`CREATE TABLE public.service_requests(id uuid primary key,user_id uuid not null,service_id uuid not null,status text not null default 'pending',created_at timestamptz not null default now(),details jsonb not null default '{}'::jsonb)`);
  await pool.query(`CREATE TABLE public.order_items(id uuid primary key default gen_random_uuid(),order_id uuid not null,service_id uuid not null,service_price_id uuid,quantity int not null default 1,unit_price numeric not null,line_total numeric not null,created_at timestamptz not null default now())`);
  await pool.query(`CREATE TABLE public.entitlements(id uuid primary key default gen_random_uuid(),user_id uuid not null,service_id uuid not null,order_id uuid,status text not null default 'active',starts_at timestamptz not null default now(),expires_at timestamptz,created_at timestamptz not null default now())`);
  await pool.query("CREATE UNIQUE INDEX entitlements_user_service_order_uidx ON public.entitlements(user_id,service_id,order_id)");
  await pool.query(migration);
  await pool.query("INSERT INTO service_requests(id,user_id,service_id,status) VALUES($1,$2,$3,'pending')",[U.request,U.user,U.service]);
  await pool.query("INSERT INTO orders(id,order_number,user_id,service_request_id,total,currency,status) VALUES($1,'ILS-TEST-1',$2,$3,1234,'INR','pending')",[U.order,U.user,U.request]);
  await pool.query("INSERT INTO order_items(id,order_id,service_id,quantity,unit_price,line_total) VALUES($1,$2,$3,1,1234,1234)",[U.item,U.order,U.service]);
}
async function concurrent(fn){return Promise.all([fn(),fn()]);}
async function main(){
  try {
    await setup();
    // Confirm service-role-only execution grants on the migration RPCs.
    for(const fn of ["ils_reserve_razorpay_attempt(uuid)","ils_attach_razorpay_order(uuid,text)","ils_finalize_razorpay_payment(uuid,text,bigint,text)"]){
      assert.equal((await pool.query("SELECT has_function_privilege('anon',$1,'EXECUTE') anon_exec,has_function_privilege('authenticated',$1,'EXECUTE') auth_exec,has_function_privilege('service_role',$1,'EXECUTE') service_exec",[ "public."+fn ])).rows[0].anon_exec,false,fn+" must not be executable by anon");
      const perms=(await pool.query("SELECT has_function_privilege('anon',$1,'EXECUTE') anon_exec,has_function_privilege('authenticated',$1,'EXECUTE') auth_exec,has_function_privilege('service_role',$1,'EXECUTE') service_exec",[ "public."+fn ])).rows[0];
      assert.equal(perms.auth_exec,false,fn+" must not be executable by authenticated");
      assert.equal(perms.service_exec,true,fn+" must be executable by service_role");
    }
    // Parallel reservations must return the same payment attempt.
    const reserve=()=>pool.query("SELECT public.ils_reserve_razorpay_attempt($1) AS result",[U.order]).then(r=>r.rows[0].result);
    const reserved=await concurrent(reserve);
    assert.equal(reserved[0].payment_id,reserved[1].payment_id,"parallel reservations must share one attempt");
    assert.equal((await pool.query("SELECT count(*)::int n FROM payments WHERE order_id=$1 AND gateway='razorpay'",[U.order])).rows[0].n,1);
    const pid=reserved[0].payment_id;
    await pool.query("UPDATE payments SET status='created',gateway_order_id='rzp_test_order_1' WHERE id=$1",[pid]);
    const finalize=(gatewayPaymentId)=>pool.query("SELECT public.ils_finalize_razorpay_payment($1,$2,$3,$4) result",[pid,gatewayPaymentId,123400,"INR"]).then(r=>r.rows[0].result);
    const settled=await concurrent(()=>finalize("rzp_test_payment_1"));
    assert.equal(settled.filter(x=>x.already_finalized===true).length,1,"second replay should report idempotent result");
    assert.equal((await pool.query("SELECT status FROM orders WHERE id=$1",[U.order])).rows[0].status,"paid");
    assert.equal((await pool.query("SELECT status,gateway_payment_id FROM payments WHERE id=$1",[pid])).rows[0].status,"paid");
    assert.equal((await pool.query("SELECT count(*)::int n FROM entitlements WHERE order_id=$1",[U.order])).rows[0].n,1,"only one entitlement");
    await assert.rejects(()=>finalize("rzp_test_payment_conflict"),/PAYMENT_ALREADY_SETTLED_DIFFERENTLY|PAYMENT_ID_MISMATCH/,"conflicting gateway payment ID must be rejected");
    // Race reservation against settlement for a separate order; both contend on order first.
    const U2={request:"77777777-7777-4777-8777-777777777777",order:"66666666-6666-4666-8666-666666666666",item:"88888888-8888-4888-8888-888888888888"};
    await pool.query("INSERT INTO service_requests(id,user_id,service_id,status) VALUES($1,$2,$3,'pending')",[U2.request,U.user,U.service]);
    await pool.query("INSERT INTO orders(id,order_number,user_id,service_request_id,total,currency,status) VALUES($1,'ILS-TEST-2',$2,$3,1234,'INR','pending')",[U2.order,U.user,U2.request]);
    await pool.query("INSERT INTO order_items(id,order_id,service_id,quantity,unit_price,line_total) VALUES($1,$2,$3,1,1234,1234)",[U2.item,U2.order,U.service]);
    const p2=(await pool.query("INSERT INTO payments(order_id,gateway,amount,currency,status) VALUES($1,'razorpay',1234,'INR','pending') RETURNING id",[U2.order])).rows[0].id;
    const raceReserve=()=>pool.query("SELECT public.ils_reserve_razorpay_attempt($1) AS result",[U2.order]).then(r=>r.rows[0].result);
    const raceFinalize=()=>pool.query("SELECT public.ils_finalize_razorpay_payment($1,$2,$3,$4) result",[p2,"rzp_test_payment_2",123400,"INR"]).then(r=>r.rows[0].result);
    const race=await Promise.allSettled([raceReserve(),raceFinalize()]);
    assert.equal(race[1].status,"fulfilled","finalizer should complete despite concurrent reservation");
    assert.equal((await pool.query("SELECT status FROM orders WHERE id=$1",[U2.order])).rows[0].status,"paid");
    assert.equal((await pool.query("SELECT count(*)::int n FROM payments WHERE order_id=$1 AND gateway='razorpay'",[U2.order])).rows[0].n,1);
    console.log("PASS: migration applies; duplicate reservations, concurrent finalization/replay, reservation-vs-finalization contention, entitlement uniqueness, and conflicting payment IDs checked.");
  } finally { await pool.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
