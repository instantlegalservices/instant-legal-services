#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const files = {
  bridge: fs.readFileSync(path.join(root, "supabase/functions/ils-test-customer-action-e2e-real-invoke-ui-bridge/index.ts"), "utf8"),
  page: fs.readFileSync(path.join(root, "ils-test-customer-action-e2e-real-invoke.html"), "utf8"),
  config: fs.readFileSync(path.join(root, "supabase/config.toml"), "utf8")
};
const failures = [];
function assert(cond, msg) { if (!cond) failures.push(msg); }

assert(files.config.includes('project_id = "bgsbuepolooybdqrzmoa"'), "config must lock TEST project");
assert(files.config.includes("ils-test-customer-action-e2e-real-invoke-ui-bridge"), "config missing bridge function");
assert(/verify_jwt\s*=\s*true/.test(files.config), "bridge must verify JWT");
assert(files.bridge.includes("CAPTURE_REAL_CUSTOMER_ACTION_EVIDENCE"), "fixed action missing");
assert(files.bridge.includes("ils_invoke_edge_function_customer_action_e2e_real_v4"), "must call existing invoke RPC");
assert(files.bridge.includes("4b781c1bbfcaaffcdd4fa316c75765af927bdc14e0d549a46244f1bf1bbd70ff"), "fixed SHA missing");
assert(files.bridge.includes("ils-customer-action-e2e-real"), "fixed slug missing");
assert(files.bridge.includes("function_version, FIXED_VERSION") || files.bridge.includes("FIXED_VERSION = 4"), "fixed version missing");
assert(files.bridge.includes("ACTOR_NOT_ALLOWED"), "actor gate missing");
assert(files.bridge.includes("TEST_SYNTHETIC_USER"), "required actor class missing");
assert(!files.bridge.includes("ils_e2e_evidence_promote_verified"), "must not promote");
assert(!files.bridge.includes("ils_evidence_promote_verified"), "must not promote via wrapper");
assert(!files.bridge.includes("ils_bind_critical_path_evidence"), "must not bind");
assert(!files.page.includes("service_role"), "page must not mention service_role");
assert(!files.page.includes("SUPABASE_SERVICE_ROLE"), "page must not include service role");
assert(!/p_function_slug|p_function_version|p_function_sha256/.test(files.page), "page must not expose slug/version/sha");
assert(files.page.includes("bgsbuepolooybdqrzmoa"), "page must target TEST");
assert(!files.page.includes("odqebkdzkjfxzyzbrndt"), "page must not include production ref");
assert(files.page.includes("signInWithPassword"), "page must use normal Auth login");
assert(files.page.includes("{ action: ALLOWED_ACTION }") || files.page.includes('action: ALLOWED_ACTION'), "page must send fixed action only");
assert(files.bridge.includes("crypto.randomUUID()"), "correlation id must be generated server-side");

if (failures.length) {
  console.error("FAIL");
  failures.forEach((f) => console.error(" -", f));
  process.exit(1);
}
console.log("PASS real-auth evidence capture UI/bridge static contract");
