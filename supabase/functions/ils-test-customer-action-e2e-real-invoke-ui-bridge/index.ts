import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TEST_PROJECT_REF = "bgsbuepolooybdqrzmoa";
const PROD_PROJECT_REF = "odqebkdzkjfxzyzbrndt";
const ALLOWED_ACTION = "CAPTURE_REAL_CUSTOMER_ACTION_EVIDENCE";
const INVOKE_RPC = "ils_invoke_edge_function_customer_action_e2e_real_v4";
const FIXED_SLUG = "ils-customer-action-e2e-real";
const FIXED_VERSION = 4;
const FIXED_SHA = "4b781c1bbfcaaffcdd4fa316c75765af927bdc14e0d549a46244f1bf1bbd70ff";
const REQUIRED_PATH = "CUSTOMER_ACTION_E2E";
const FORBIDDEN_BODY_KEYS = [
  "version",
  "p_version",
  "rpc",
  "rpc_name",
  "function",
  "function_name",
  "function_slug",
  "sha",
  "function_sha256",
  "url",
  "sql",
  "query",
  "arguments",
  "args",
  "target",
  "project",
  "supabase_url",
  "correlation_id",
  "p_correlation_id",
  "p_user_jwt",
  "p_function_version",
  "p_function_sha256"
];

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    }
  });
}

function hold(error: string, extra: Record<string, unknown> = {}, status = 403) {
  return json({
    ok: false,
    gate: "HOLD",
    error,
    function_slug: FIXED_SLUG,
    function_version: FIXED_VERSION,
    function_sha256: FIXED_SHA,
    production_touch_detected: false,
    ...extra
  }, status);
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(b64 + pad));
  } catch {
    return null;
  }
}

function projectRefFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const m = host.match(/^([a-z0-9]+)\.supabase\.co$/);
    return m ? m[1] : "";
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return hold("METHOD_NOT_ALLOWED", {}, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const envRef = projectRefFromUrl(supabaseUrl);
  if (!supabaseUrl || envRef !== TEST_PROJECT_REF) {
    return hold("TEST_PROJECT_REQUIRED", { production_touch_detected: envRef === PROD_PROJECT_REF }, 500);
  }
  if (supabaseUrl.includes(PROD_PROJECT_REF) || envRef === PROD_PROJECT_REF) {
    return hold("PRODUCTION_ACCESS_FORBIDDEN", { production_touch_detected: true }, 403);
  }
  if (!serviceKey) return hold("SERVER_CONFIG_ERROR", {}, 500);

  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return hold("AUTH_REQUIRED", {}, 401);
  const userJwt = auth.slice(7).trim();
  const jwtPayload = decodeJwtPayload(userJwt);
  const iss = String(jwtPayload?.iss || "");
  if (!iss.includes(TEST_PROJECT_REF)) return hold("TEST_ISSUER_REQUIRED", {}, 401);
  if (iss.includes(PROD_PROJECT_REF)) return hold("PRODUCTION_ACCESS_FORBIDDEN", { production_touch_detected: true }, 403);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return hold("INVALID_JSON", {}, 400);
  }
  for (const key of Object.keys(body)) {
    if (FORBIDDEN_BODY_KEYS.includes(key)) return hold("ARBITRARY_PARAMETER_REJECTED", { key }, 403);
  }
  if (body.action !== ALLOWED_ACTION) return hold("ACTION_NOT_ALLOWED", {}, 403);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: userData, error: userError } = await admin.auth.getUser(userJwt);
  const user = userData?.user;
  if (userError || !user) return hold("UNAUTHORIZED", {}, 401);
  if (!user.email_confirmed_at) return hold("USER_NOT_VERIFIED", {}, 403);

  const { data: contract, error: contractError } = await admin
    .from("ils_genuine_e2e_evidence_contract")
    .select("path_code,required_actor,customer_data_allowed,destructive_allowed,production_allowed,real_external_action_required")
    .eq("path_code", REQUIRED_PATH)
    .maybeSingle();
  if (contractError || !contract) return hold("CONTRACT_MISSING", {}, 503);
  if (contract.production_allowed || contract.customer_data_allowed || contract.destructive_allowed) {
    return hold("UNSAFE_CONTRACT_FLAGS", {}, 403);
  }

  const { data: registry, error: registryError } = await admin
    .from("ils_e2e_function_deployment_registry")
    .select("function_slug,function_version,deployment_sha256,active")
    .eq("function_slug", FIXED_SLUG)
    .eq("function_version", FIXED_VERSION)
    .eq("critical_path_code", REQUIRED_PATH)
    .eq("active", true)
    .maybeSingle();
  if (registryError || !registry) return hold("DEPLOYMENT_REGISTRY_MISSING", {}, 503);
  if (registry.deployment_sha256 !== FIXED_SHA) return hold("FUNCTION_SHA_MISMATCH", {}, 503);

  const { data: operatorRow } = await admin
    .from("ils_test_synthetic_provision_operators")
    .select("operator_user_id,role,active")
    .eq("operator_user_id", user.id)
    .eq("active", true)
    .maybeSingle();
  const { data: claimRow } = await admin
    .from("ils_test_synthetic_provision_claims")
    .select("auth_user_id,outcome")
    .eq("auth_user_id", user.id)
    .eq("outcome", "COMPLETED")
    .maybeSingle();

  let actorClass = "TEST_AUTH_USER";
  if (claimRow?.auth_user_id === user.id) actorClass = "TEST_SYNTHETIC_USER";
  else if (operatorRow?.operator_user_id === user.id) actorClass = String(operatorRow.role || "TEST_PROVISION_OPERATOR");

  const actorAllowed = actorClass === String(contract.required_actor);
  const preflight = {
    required_actor: contract.required_actor,
    actor_class: actorClass,
    actor_allowed: actorAllowed,
    authenticated_user_id: user.id,
    user_verified: true,
    registry_active: true,
    function_slug: FIXED_SLUG,
    function_version: FIXED_VERSION,
    function_sha256: FIXED_SHA,
    production_touch_detected: false,
    customer_data_allowed: false,
    payment_allowed: false,
    government_submission_allowed: false,
    professional_execution_allowed: false,
    destructive_allowed: false,
    real_external_action_allowed: false
  };
  if (!actorAllowed) return hold("ACTOR_NOT_ALLOWED", { preflight }, 403);

  const correlationId = crypto.randomUUID();
  const { data: invokeRows, error: invokeError } = await admin.rpc(INVOKE_RPC, {
    p_user_jwt: userJwt,
    p_correlation_id: correlationId,
    p_authenticated: true,
    p_user_verified: true,
    p_synthetic: false,
    p_fixture_only: false,
    p_production_access: false
  });
  const invokeRow = Array.isArray(invokeRows) ? invokeRows[0] : invokeRows;
  if (invokeError) {
    return hold("INVOKE_RPC_FAILED", {
      preflight,
      correlation_id: correlationId,
      detail: invokeError.message
    }, 500);
  }
  if (!invokeRow?.invocation_allowed) {
    return hold(String(invokeRow?.reason_code || "INVOKE_REJECTED"), {
      preflight,
      correlation_id: correlationId,
      http_status: invokeRow?.http_status ?? null,
      evidence_id: invokeRow?.evidence_id ?? null
    }, 403);
  }

  const evidenceId = invokeRow.evidence_id as string | null;
  if (!evidenceId) {
    return hold("EVIDENCE_ID_MISSING", { preflight, correlation_id: correlationId, http_status: invokeRow.http_status ?? null }, 500);
  }

  const { data: evidence, error: evidenceError } = await admin
    .from("ils_e2e_evidence")
    .select("id,evidence_class,provenance_class,function_slug,function_version,function_sha256,authenticated_user_id,invocation_correlation_id,critical_path_code,source_type,details")
    .eq("id", evidenceId)
    .maybeSingle();
  if (evidenceError || !evidence) {
    return hold("EVIDENCE_READ_FAILED", { preflight, correlation_id: correlationId, evidence_id: evidenceId }, 500);
  }
  if (evidence.evidence_class !== "UNVERIFIED") {
    return hold("UNEXPECTED_EVIDENCE_CLASS", { preflight, correlation_id: correlationId, evidence_id: evidenceId, evidence_class: evidence.evidence_class }, 500);
  }
  if (evidence.provenance_class !== "REAL_AUTHENTICATED") {
    return hold("UNEXPECTED_PROVENANCE_CLASS", { preflight, correlation_id: correlationId, evidence_id: evidenceId, provenance_class: evidence.provenance_class }, 500);
  }

  let details: Record<string, unknown> = {};
  try {
    details = typeof evidence.details === "string" ? JSON.parse(evidence.details) : (evidence.details as Record<string, unknown>) || {};
  } catch {
    details = {};
  }

  return json({
    ok: true,
    gate: "HOLD",
    promoted: false,
    http_status: invokeRow.http_status ?? 200,
    correlation_id: correlationId,
    authenticated_user_id: user.id,
    evidence_id: evidence.id,
    function_slug: evidence.function_slug,
    function_version: evidence.function_version,
    function_sha256: evidence.function_sha256,
    provenance_class: evidence.provenance_class,
    evidence_class: evidence.evidence_class,
    source_type: evidence.source_type,
    critical_path_code: evidence.critical_path_code,
    production_touch_detected: details.production_access === true,
    safety_flags: {
      destructive: details.destructive === true,
      external_action: details.external_action === true,
      production_access: details.production_access === true,
      customer_data_allowed: false,
      payment_allowed: false,
      government_submission_allowed: false,
      professional_execution_allowed: false
    },
    preflight
  });
});
