import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isMatchingIssuedHandoff,
  sha256Hex,
} from "../_shared/synthetic-auth-handoff-policy.ts";

const REF = "bgsbuepolooybdqrzmoa";
const SYN = "82de1b27-5939-4f9e-bdce-313ed59ee7b1";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const requestUrl = new URL(req.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const handoffId = requestUrl.searchParams.get("handoff_id");
  if (!tokenHash || !handoffId) {
    return json({ error: "HANDOFF_PARAMETERS_REQUIRED" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!url.includes(REF) || !service || !anon) {
    return json({ error: "AUTH_OR_CONFIG_REQUIRED" }, 500);
  }

  const tokenDigest = await sha256Hex(tokenHash);
  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: handoff, error: handoffError } = await admin
    .from("ils_test_synthetic_auth_handoffs")
    .select("id,synthetic_user_id,operator_user_id,status,correlation_id,expires_at,token_hash_sha256")
    .eq("id", handoffId)
    .single();

  if (
    handoffError || !handoff ||
    !isMatchingIssuedHandoff(handoff, SYN, tokenDigest)
  ) {
    return json({ error: "HANDOFF_INVALID_OR_EXPIRED" }, 400);
  }

  // Reject a revoked operator before consuming the one-time Auth token.
  // The atomic consume RPC below rechecks under a row lock to close the revocation race.
  const { data: operator, error: operatorError } = await admin.rpc(
    "ils_test_get_provision_operator",
    { p_operator_user_id: handoff.operator_user_id },
  );
  const op = Array.isArray(operator) ? operator[0] : operator;
  if (
    operatorError || !op || op.role !== "TEST_PROVISION_OPERATOR" ||
    op.active !== true
  ) {
    return json({ error: "TEST_PROVISION_OPERATOR_REVOKED" }, 403);
  }

  const client = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: sessionData, error: verifyError } = await client.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });

  if (verifyError || !sessionData?.session || sessionData.user?.id !== SYN) {
    return json({
      error: "MAGICLINK_VERIFICATION_FAILED",
      detail: verifyError?.message || null,
    }, 401);
  }

  // Atomically revalidate the issuing operator and consume this exact handoff.
  // The database RPC locks the operator row before the handoff row, so revocation
  // cannot race a stale authorization check and concurrent callbacks cannot replay.
  const { data: consumed, error: consumeError } = await admin.rpc(
    "ils_test_consume_synthetic_auth_handoff",
    {
      p_handoff_id: handoffId,
      p_synthetic_user_id: SYN,
      p_operator_user_id: handoff.operator_user_id,
      p_token_hash_sha256: tokenDigest,
    },
  );

  if (consumeError || consumed !== true) {
    await client.auth.signOut();
    return json({ error: "HANDOFF_ALREADY_CONSUMED_INVALID_OR_OPERATOR_REVOKED" }, 409);
  }

  const response = await fetch(url + "/functions/v1/ils-notification-e2e-real", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + sessionData.session.access_token,
      apikey: anon,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "CAPTURE_REAL_NOTIFICATION_E2E_EVIDENCE",
      correlation_id: handoff.correlation_id,
    }),
  });
  const responseBody = await response.json().catch(() => ({}));
  await client.auth.signOut();

  // A failed downstream attempt remains consumed. A fresh operator-issued
  // handoff is required; never reopen a single-use OTP handoff for replay.
  if (!response.ok) {
    return json({ error: "NOTIFICATION_E2E_FAILED", detail: responseBody }, response.status);
  }

  return json(responseBody);
});
