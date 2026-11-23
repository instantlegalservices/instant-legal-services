import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isUniqueViolation,
  newHandoffExpiry,
  sha256Hex,
  staleIssuedHandoffCutoff,
} from "../_shared/synthetic-auth-handoff-policy.ts";

const REF = "bgsbuepolooybdqrzmoa";
const SYN = "82de1b27-5939-4f9e-bdce-313ed59ee7b1";
const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,apikey,content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: H });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authorization = req.headers.get("authorization") || "";
  if (!url.includes(REF) || !key || !authorization) {
    return json({ error: "AUTH_OR_CONFIG_REQUIRED" }, 401);
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error } = await admin.auth.getUser(
    authorization.replace(/^Bearer\s+/i, ""),
  );
  if (error || !user) return json({ error: "AUTH_REQUIRED" }, 401);

  const { data: operator, error: operatorError } = await admin.rpc(
    "ils_test_get_provision_operator",
    { p_operator_user_id: user.id },
  );
  const op = Array.isArray(operator) ? operator[0] : operator;
  if (
    operatorError || !op || op.role !== "TEST_PROVISION_OPERATOR" ||
    op.active !== true
  ) {
    return json({ error: "TEST_PROVISION_OPERATOR_REQUIRED" }, 403);
  }

  const { data: synthetic, error: syntheticError } = await admin.auth.admin
    .getUserById(SYN);
  if (syntheticError || !synthetic?.user?.email) {
    return json({ error: "SYNTHETIC_USER_LOOKUP_FAILED" }, 500);
  }

  const now = new Date().toISOString();
  await admin.from("ils_test_synthetic_auth_handoffs")
    .update({ status: "SUPERSEDED" })
    .eq("synthetic_user_id", SYN)
    .eq("status", "ISSUED")
    .lt("issued_at", staleIssuedHandoffCutoff());

  const { data: active } = await admin.from("ils_test_synthetic_auth_handoffs")
    .select("id")
    .eq("synthetic_user_id", SYN)
    .eq("status", "ISSUED")
    .gt("expires_at", now)
    .limit(1);

  if (active?.length) {
    return json({
      error: "ACTIVE_HANDOFF_ALREADY_EXISTS",
      handoff_id: active[0].id,
    }, 409);
  }

  // Generate first, then persist the digest in the same INSERT as the ISSUED row.
  // No issued handoff can exist without being cryptographically bound to its token.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: synthetic.user.email,
    options: {
      redirectTo:
        "https://" + REF + ".supabase.co/functions/v1/ils-test-notification-e2e-auth-confirm",
    },
  });
  if (linkError || !link?.properties?.hashed_token) {
    return json({ error: "MAGICLINK_GENERATION_FAILED" }, 500);
  }

  const correlation = crypto.randomUUID();
  const expires = newHandoffExpiry();
  const tokenDigest = await sha256Hex(link.properties.hashed_token);
  const { data: handoff, error: insertError } = await admin
    .from("ils_test_synthetic_auth_handoffs")
    .insert({
      synthetic_user_id: SYN,
      operator_user_id: user.id,
      status: "ISSUED",
      correlation_id: correlation,
      expires_at: expires,
      token_hash_sha256: tokenDigest,
    })
    .select("id")
    .single();

  if (insertError) {
    if (isUniqueViolation(insertError.code)) {
      const { data: raced } = await admin
        .from("ils_test_synthetic_auth_handoffs")
        .select("id")
        .eq("synthetic_user_id", SYN)
        .eq("status", "ISSUED")
        .gt("expires_at", new Date().toISOString())
        .limit(1);
      if (raced?.length) {
        return json({
          error: "ACTIVE_HANDOFF_ALREADY_EXISTS",
          handoff_id: raced[0].id,
        }, 409);
      }
    }
    return json({ error: "HANDOFF_INSERT_FAILED" }, 500);
  }

  return json({
    ok: true,
    handoff_id: handoff.id,
    correlation_id: correlation,
    expires_at: expires,
    handoff_url:
      "https://" + REF +
      ".supabase.co/functions/v1/ils-test-notification-e2e-auth-confirm?token_hash=" +
      encodeURIComponent(link.properties.hashed_token) +
      "&handoff_id=" + encodeURIComponent(handoff.id),
  });
});
