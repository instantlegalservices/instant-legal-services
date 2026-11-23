"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const confirm = fs.readFileSync("supabase/functions/ils-test-notification-e2e-auth-confirm/index.ts","utf8");
const migration = fs.readFileSync("supabase/test-only/20261123004000_atomic_synthetic_handoff_consume.sql","utf8");

assert.ok(confirm.includes('select("id,synthetic_user_id,operator_user_id,status,correlation_id,expires_at,token_hash_sha256")'));
assert.ok(confirm.includes('"ils_test_get_provision_operator"'));
assert.ok(confirm.includes('"ils_test_consume_synthetic_auth_handoff"'));
assert.ok(confirm.includes("p_operator_user_id: handoff.operator_user_id"));
assert.ok(confirm.indexOf('"ils_test_get_provision_operator"') < confirm.indexOf('client.auth.verifyOtp'),"operator must be checked before consuming the magic-link token");
assert.ok(confirm.indexOf('"ils_test_consume_synthetic_auth_handoff"') > confirm.indexOf('client.auth.verifyOtp'),"atomic consume must occur only after successful OTP verification");
assert.ok(!confirm.includes('.update({ status: "CONSUMED"'),"handoff must not be consumed by a client-side check-then-update");
assert.ok(migration.includes("FOR UPDATE"),"operator row must be locked during final consumption");
assert.ok(migration.includes("o.role = 'TEST_PROVISION_OPERATOR'"));
assert.ok(migration.includes("v_operator_active IS DISTINCT FROM true"));
assert.ok(migration.includes("h.operator_user_id = p_operator_user_id"));
assert.ok(migration.includes("h.token_hash_sha256 = p_token_hash_sha256"));
assert.ok(migration.includes("h.expires_at > clock_timestamp()"));
assert.ok(migration.includes("FROM PUBLIC, anon, authenticated"));
assert.ok(migration.includes("TO service_role"));

console.log("PASS: confirm path revalidates the operator and consumes the exact handoff atomically under an operator row lock.");
