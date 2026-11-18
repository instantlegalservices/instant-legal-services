#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const sqlPath = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260923_ils_invoke_edge_function_customer_action_e2e_real_v4.sql"
);
const sql = fs.readFileSync(sqlPath, "utf8");
const failures = [];

function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const invokeName = "ils_invoke_edge_function_customer_action_e2e_real_v4";
assert(sql.includes(invokeName), "missing invoke routine name");
assert(
  /invoke[\s\S]*edge[\s\S]*function/i.test(invokeName),
  "routine name must match %invoke%edge%function%"
);
assert(
  sql.includes("CREATE OR REPLACE FUNCTION public.ils_evidence_promote_verified"),
  "missing promoter compatibility wrapper"
);
assert(
  !/CREATE OR REPLACE FUNCTION public\.ils_e2e_evidence_promote_verified/i.test(sql),
  "must not replace existing promoter"
);
assert(
  /RETURN public\.ils_e2e_evidence_promote_verified\(/.test(sql),
  "wrapper must delegate to existing promoter"
);
assert(sql.includes("SECURITY DEFINER"), "SECURITY DEFINER required");
assert(sql.includes("service_role_only"), "service_role_only guard required");
assert(
  sql.includes("GRANT EXECUTE ON FUNCTION public." + invokeName),
  "invoke GRANT EXECUTE missing"
);
assert(
  sql.includes("GRANT EXECUTE ON FUNCTION public.ils_evidence_promote_verified"),
  "wrapper GRANT EXECUTE missing"
);
assert(sql.includes("REVOKE ALL ON FUNCTION public." + invokeName), "invoke REVOKE missing");
assert(sql.includes("FROM anon, authenticated"), "anon/authenticated revoke required");
assert(!/\bTO anon\b/.test(sql), "must not grant to anon");
assert(!/\bTO authenticated\b/.test(sql), "must not grant to authenticated");
assert(sql.includes("ils-customer-action-e2e-real"), "fixed slug missing");
assert(sql.includes("function_version integer") || sql.includes("c_ver constant integer := 4"), "fixed version 4 missing");
assert(
  sql.includes("4b781c1bbfcaaffcdd4fa316c75765af927bdc14e0d549a46244f1bf1bbd70ff"),
  "fixed registry v4 SHA missing"
);
assert(sql.includes("CAPTURE_REAL_CUSTOMER_ACTION_EVIDENCE"), "fixed action missing");
assert(
  sql.includes("https://bgsbuepolooybdqrzmoa.supabase.co/functions/v1/ils-customer-action-e2e-real"),
  "fixed TEST URL missing"
);
assert(!sql.includes("odqebkdzkjfxzyzbrndt"), "production project ref must not appear");
assert(!/p_url\b/.test(sql), "arbitrary URL parameter prohibited");
assert(!/p_function_slug\b/.test(sql), "arbitrary function slug parameter prohibited");
assert(!/p_function_version\b/.test(sql), "arbitrary version parameter prohibited");
assert(!/p_function_sha256\b/.test(sql), "arbitrary SHA parameter prohibited");
assert(sql.includes("CUSTOMER_ACTION_REAL_AUTH_V1"), "must bind existing bridge contract");
assert(sql.includes("ils_customer_action_e2e_sha_provenance_guard_v2"), "must use sha guard");
assert(sql.includes("ils_customer_action_e2e_real_provenance_precheck"), "must use provenance precheck");
assert(sql.includes("ils_authenticated_e2e_invocation_bridge_contract_check"), "must use bridge contract check");
assert(sql.includes("PRODUCTION_ACCESS_FORBIDDEN") || sql.includes("p_production_access"), "production access must be rejected");
assert(sql.includes("SYNTHETIC_OR_FIXTURE_REJECTED"), "synthetic/fixture must be rejected");
assert(sql.includes("TEST_ISSUER_REQUIRED"), "TEST issuer check required");
assert(!/gate_status\s*=\s*'GO'/.test(sql), "must not write genuine gate GO");
assert(!/proof_class\s*=\s*'REAL_VERIFIED'/.test(sql), "must not write proof_class REAL_VERIFIED");
assert(!/INSERT INTO public\.ils_e2e_evidence/i.test(sql), "must not manually insert evidence");
assert(!/ils_bind_customer_action_e2e_proof/.test(sql), "must not run proof bind");
assert(!/ils_audit_genuine_e2e_contract_binding/.test(sql), "must not run contract binding audit");
assert(!/ils_evaluate_customer_action_genuine_e2e_proof_gate/.test(sql), "must not evaluate genuine gate");
assert(!/submit-upi-payment|verify-upi|gst-drc01c|government/i.test(sql), "must not target payment/gov functions");

if (failures.length) {
  console.error("FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("PASS static invoke-edge-function + promoter wrapper contract");
console.log(JSON.stringify({
  invoke_name: invokeName,
  gap_detector_name_match: true,
  fixed_slug: "ils-customer-action-e2e-real",
  fixed_version: 4,
  fixed_sha: "4b781c1bbfcaaffcdd4fa316c75765af927bdc14e0d549a46244f1bf1bbd70ff",
  promoter_wrapper: "ils_evidence_promote_verified",
  production_ref_present: false
}, null, 2));
