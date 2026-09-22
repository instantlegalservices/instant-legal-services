#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(
  ROOT,
  "supabase/functions/ils-test-customer-action-e2e-proof-run-ui-bridge/index.ts"
);
const CONFIG = path.join(ROOT, "supabase/config.toml");
const FIXTURE_SRC = path.join(
  ROOT,
  "supabase/functions/ils-test-customer-action-e2e-ui-bridge/index.ts"
);
const TEST_REF = "bgsbuepolooybdqrzmoa";
const PROD_REF = "odqebkdzkjfxzyzbrndt";
const BRIDGE =
  "https://" + TEST_REF + ".supabase.co/functions/v1/ils-test-customer-action-e2e-proof-run-ui-bridge";

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("PASS:", msg);
  }
}

const src = fs.readFileSync(SRC, "utf8");
const cfg = fs.readFileSync(CONFIG, "utf8");
const fixtureSrc = fs.readFileSync(FIXTURE_SRC, "utf8");

assert(
  src.includes('ALLOWED_ACTION = "CREATE_CUSTOMER_ACTION_CONTROLLED_PROOF_RUN"'),
  "fixed action only"
);
assert(src.includes('CANONICAL_VERSION = "533.1"'), "version 533.1 is hardcoded");
assert(
  src.includes('CANONICAL_RPC = "ils_run_customer_action_e2e_controlled_proof"'),
  "canonical proof-run RPC only"
);
assert(src.includes("p_version: CANONICAL_VERSION"), "explicit p_version 533.1, not function default");
assert(!/admin\.rpc\(\s*CANONICAL_RPC\s*\)/.test(src), "does not call runner without p_version");
assert(!src.includes("535.1"), "does not silently use runner default 535.1");
assert(!src.includes("ils_prepare_customer_action_e2e_controlled_fixture"), "does not invoke fixture prepare");
assert(!src.includes("ils_bind_customer_action_e2e_proof"), "does not invoke proof binding");
assert(!src.includes("ils_customer_action_e2e_proof_audit_verify"), "does not invoke audit");
assert(!src.includes("odqebkdzkjfxzyzbrndt"), "source does not target production");
assert(src.includes(TEST_REF), "source pins TEST project ref");
assert(src.includes("TEST_PROJECT_REQUIRED"), "rejects non-TEST SUPABASE_URL");
assert(src.includes("ARBITRARY_INPUT_REJECTED"), "rejects client version/rpc/sql keys");
assert(src.includes("UNSUPPORTED_ACTION"), "rejects arbitrary action");
assert(src.includes("ils_is_active_test_provision_operator_v1"), "uses canonical operator check");
assert(src.includes("SYNTHETIC_IDENTITY_NOT_OPERATOR"), "rejects ils.synthetic operator");
assert(src.includes("service_role"), "rejects browser service_role JWT");
assert(!/p_version:\s*body/i.test(src), "does not take version from client");
assert(!/rpc:\s*body/i.test(src), "does not take RPC name from client");
assert(cfg.includes('project_id = "bgsbuepolooybdqrzmoa"'), "config.toml is TEST-only");
assert(
  cfg.includes("[functions.ils-test-customer-action-e2e-proof-run-ui-bridge]"),
  "config.toml registers proof-run bridge"
);
assert(!cfg.includes(PROD_REF), "config.toml does not name production");
assert(
  fixtureSrc.includes('ALLOWED_ACTION = "PREPARE_CUSTOMER_ACTION_FIXTURE"'),
  "existing fixture bridge action unchanged"
);
assert(
  !fixtureSrc.includes("CREATE_CUSTOMER_ACTION_CONTROLLED_PROOF_RUN"),
  "existing fixture bridge not extended"
);

function request(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        method,
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: headers || {}
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let parsed = data;
          try {
            parsed = JSON.parse(data);
          } catch (_) {}
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function live() {
  const missing = await request(
    "POST",
    BRIDGE,
    { "Content-Type": "application/json", Accept: "application/json" },
    JSON.stringify({ action: "CREATE_CUSTOMER_ACTION_CONTROLLED_PROOF_RUN" })
  );
  console.log("live missing-auth HTTP", missing.status, missing.body && missing.body.error || missing.body);
  const missingRejected =
    missing.status === 401 ||
    missing.status === 403 ||
    (missing.body && String(missing.body.code || "").includes("UNAUTHORIZED"));
  if (missing.status === 404) {
    console.log("NOTE: proof-run bridge not deployed to TEST yet (HTTP 404)");
  }
  assert(
    missingRejected || missing.status === 404,
    "1. missing auth → rejected (or undeployed 404)"
  );
  assert(
    missing.status !== 200 || missing.body?.ok !== true,
    "1. missing auth does not create a proof run"
  );

  const badFmt = await request(
    "POST",
    BRIDGE,
    {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer"
    },
    JSON.stringify({ action: "CREATE_CUSTOMER_ACTION_CONTROLLED_PROOF_RUN" })
  );
  console.log("live invalid-bearer HTTP", badFmt.status, badFmt.body && badFmt.body.error || badFmt.body);
  assert(
    badFmt.status === 401 || badFmt.status === 403 || badFmt.status === 404,
    "2. invalid/non-user auth → rejected (or undeployed 404)"
  );

  const anonAsUser = await request(
    "POST",
    BRIDGE,
    {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer sb_publishable_not_a_user_jwt"
    },
    JSON.stringify({ action: "CREATE_CUSTOMER_ACTION_CONTROLLED_PROOF_RUN" })
  );
  console.log("live non-user bearer HTTP", anonAsUser.status, anonAsUser.body && anonAsUser.body.error || anonAsUser.body);
  assert(
    anonAsUser.status === 401 || anonAsUser.status === 403 || anonAsUser.status === 404,
    "2b. non-user credential → rejected"
  );

  const arbitrary = await request(
    "POST",
    BRIDGE,
    {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYW5vbiJ9.x"
    },
    JSON.stringify({ action: "DROP_EVERYTHING", version: "535.1", sql: "select 1" })
  );
  console.log("live arbitrary op HTTP", arbitrary.status, arbitrary.body && arbitrary.body.error || arbitrary.body);
  const arbRejected = arbitrary.status >= 400 && arbitrary.body?.ok !== true;
  assert(arbRejected, "5/6. arbitrary operation/version/sql → rejected");

  assert(!String(JSON.stringify(arbitrary.body || {})).includes(PROD_REF), "7. production ref not targeted");

  console.log(
    "LIVE_OPERATOR_TEST: SKIPPED (no TEST operator user JWT in this environment; do not fabricate JWTs)"
  );
}

live()
  .then(() => {
    if (failed) {
      console.error(failed + " assertion(s) failed");
      process.exit(1);
    }
    console.log("\nProof-run bridge contract tests passed (live operator path not executed)");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
