#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PAGE = path.join(ROOT, "ils-test-customer-action-e2e-proof-run.html");
const FIXTURE_PAGE = path.join(ROOT, "ils-test-customer-action-e2e.html");
const ROBOTS = path.join(ROOT, "robots.txt");
const TEST_REF = "bgsbuepolooybdqrzmoa";
const PROD_REF = "odqebkdzkjfxzyzbrndt";

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("PASS:", msg);
  }
}

const html = fs.readFileSync(PAGE, "utf8");
const fixtureHtml = fs.readFileSync(FIXTURE_PAGE, "utf8");
const robots = fs.readFileSync(ROBOTS, "utf8");

assert(/name=["']robots["'][^>]*content=["']noindex,nofollow,noarchive["']/.test(html)
  || /content=["']noindex,nofollow,noarchive["'][^>]*name=["']robots["']/.test(html),
  "meta robots noindex,nofollow,noarchive");
assert(
  html.includes('rel="canonical" href="https://instantlegalservices.in/ils-test-customer-action-e2e-proof-run.html"'),
  "self-canonical"
);
assert(html.includes(TEST_REF), "TEST project present");
assert(!html.includes(PROD_REF), "no production project");
assert(
  html.includes("https://bgsbuepolooybdqrzmoa.supabase.co/functions/v1/ils-test-operator-bootstrap-public-config"),
  "loads TEST public-config"
);
assert(
  html.includes("https://bgsbuepolooybdqrzmoa.supabase.co/functions/v1/ils-test-customer-action-e2e-proof-run-ui-bridge"),
  "calls proof-run ui-bridge only"
);
assert(!/ils-test-customer-action-e2e-ui-bridge/.test(html), "does not call fixture prepare bridge");
assert(!/ils-test-operator-bootstrap-ui-bridge/.test(html), "does not call 1084 bootstrap bridge");
assert(!/BOOTSTRAP_TEST_OPERATOR/.test(html), "does not execute 1084 action");
assert(!/CREATE_APPROVED_SYNTHETIC_IDENTITY/.test(html), "does not execute 1085 provision");
assert(!/PREPARE_CUSTOMER_ACTION_FIXTURE/.test(html), "does not prepare fixture");
assert(!/ils_bind_customer_action_e2e_proof/.test(html), "does not bind proof");
assert(/signInWithPassword/.test(html), "uses signInWithPassword");
assert(/signOut/.test(html), "signs out after operation");
assert(
  html.includes('action:"CREATE_CUSTOMER_ACTION_CONTROLLED_PROOF_RUN"'),
  "POST body action is CREATE_CUSTOMER_ACTION_CONTROLLED_PROOF_RUN"
);
assert(!/action:"[^"]+",/.test(html.replace(/action:"CREATE_CUSTOMER_ACTION_CONTROLLED_PROOF_RUN"/g, "")),
  "no extra action payloads");
assert(!/p_version|SERVICE_ROLE|service_role/.test(html), "no version override or service_role");
assert(/HTTP " \+/.test(html) || /HTTP "\s*\+/.test(html) || html.includes('"HTTP "'),
  "displays HTTP status");
assert(/JSON\.stringify\(\s*result/.test(html), "displays JSON response");
assert(/persistSession:false/.test(html), "does not persist session");
assert(/TEST_PROJECT_REQUIRED/.test(html), "rejects non-TEST public config URL");
assert(/Disallow:\s*\/ils-test-/.test(robots), "robots Disallow covers /ils-test- pages");
assert(
  fixtureHtml.includes('action:"PREPARE_CUSTOMER_ACTION_FIXTURE"'),
  "existing fixture page action unchanged"
);
assert(
  !fixtureHtml.includes("CREATE_CUSTOMER_ACTION_CONTROLLED_PROOF_RUN"),
  "existing fixture page not extended"
);

if (failed) {
  console.error("\n" + failed + " assertion(s) failed");
  process.exit(1);
}
console.log("\nils-test-customer-action-e2e-proof-run.html source tests passed");
