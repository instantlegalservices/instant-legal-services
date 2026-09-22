import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TEST_PROJECT_REF = "bgsbuepolooybdqrzmoa";
const ALLOWED_ACTION = "CREATE_CUSTOMER_ACTION_CONTROLLED_PROOF_RUN";
const CANONICAL_VERSION = "533.1";
const CANONICAL_RPC = "ils_run_customer_action_e2e_controlled_proof";
const FORBIDDEN_BODY_KEYS = [
  "version",
  "p_version",
  "rpc",
  "rpc_name",
  "function",
  "function_name",
  "sql",
  "query",
  "arguments",
  "args",
  "p_sql",
  "target",
  "project",
  "supabase_url"
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
  return json({ ok: false, gate: "HOLD", error, ...extra }, status);
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

function asNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") {
    return hold("METHOD_NOT_ALLOWED", {}, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  if (!supabaseUrl.includes(TEST_PROJECT_REF)) {
    return hold("TEST_PROJECT_REQUIRED", {
      message: "This bridge may run only on TEST project bgsbuepolooybdqrzmoa."
    });
  }

  const auth = req.headers.get("Authorization") || "";
  if (!auth) {
    return json(
      { ok: false, gate: "HOLD", error: "UNAUTHORIZED_NO_AUTH_HEADER", message: "Missing authorization header" },
      401
    );
  }
  const match = /^Bearer\s+(\S+)$/i.exec(auth);
  if (!match) {
    return json(
      {
        ok: false,
        gate: "HOLD",
        error: "UNAUTHORIZED_INVALID_JWT_FORMAT",
        message: "Auth header is not 'Bearer {token}'"
      },
      401
    );
  }
  const token = match[1];
  const payload = decodeJwtPayload(token);
  if (!payload) {
    return json(
      { ok: false, gate: "HOLD", error: "UNAUTHORIZED_INVALID_JWT_FORMAT", message: "Auth header is not a user JWT" },
      401
    );
  }
  const jwtRole = String(payload.role || payload.rol || "");
  if (jwtRole === "service_role") {
    return json(
      {
        ok: false,
        gate: "HOLD",
        error: "UNUSABLE_CREDENTIAL",
        message: "This endpoint authenticates a user, not a project — a service_role credential is rejected."
      },
      401
    );
  }
  if (jwtRole === "anon") {
    return json(
      {
        ok: false,
        gate: "HOLD",
        error: "UNUSABLE_CREDENTIAL",
        message: "This endpoint authenticates a user, not a project."
      },
      401
    );
  }

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    if (raw.trim()) body = JSON.parse(raw);
  } catch {
    return hold("INVALID_JSON", {}, 400);
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return hold("INVALID_JSON", {}, 400);
  }

  const forbidden = Object.keys(body).filter((k) => FORBIDDEN_BODY_KEYS.includes(k.toLowerCase()));
  if (forbidden.length) {
    return hold("ARBITRARY_INPUT_REJECTED", { rejected_keys: forbidden });
  }

  const action = String(body.action || "");
  if (action !== ALLOWED_ACTION) {
    return hold("UNSUPPORTED_ACTION", {
      allowed_action: ALLOWED_ACTION,
      received_action: action || null
    });
  }

  const anonKey =
    Deno.env.get("SUPABASE_ANON_KEY") ||
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
    "";
  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SECRET_KEY") ||
    "";
  if (!anonKey || !serviceKey) {
    return hold("BRIDGE_NOT_CONFIGURED", {}, 503);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user?.id) {
    return json(
      {
        ok: false,
        gate: "HOLD",
        error: "UNAUTHORIZED_USER_REQUIRED",
        message: "A signed-in TEST Auth user session is required."
      },
      401
    );
  }
  const user = userData.user;
  const email = String(user.email || "").toLowerCase();
  if (email.startsWith("ils.synthetic.")) {
    return hold("SYNTHETIC_IDENTITY_NOT_OPERATOR", {
      message: "The synthetic customer Auth user cannot invoke this operator bridge."
    });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: isOperator, error: opError } = await admin.rpc(
    "ils_is_active_test_provision_operator_v1",
    { p_operator_user_id: user.id }
  );
  if (opError) {
    return hold("OPERATOR_AUTHORIZATION_UNAVAILABLE", { message: opError.message }, 503);
  }
  if (isOperator !== true) {
    return hold("TEST_PROVISION_OPERATOR_REQUIRED", {
      message: "Authenticated user is not an active TEST provision operator."
    });
  }

  const { data: run, error: rpcError } = await admin.rpc(CANONICAL_RPC, {
    p_version: CANONICAL_VERSION
  });
  if (rpcError) {
    return hold("PROOF_RUN_CREATE_FAILED", { message: rpcError.message }, 502);
  }

  const row = Array.isArray(run) ? run[0] : run;
  if (!row || typeof row !== "object") {
    return hold("PROOF_RUN_RESPONSE_INVALID");
  }
  const rec = row as Record<string, unknown>;

  const counts = {
    total_checks: asNum(rec.total_checks),
    passed_checks: asNum(rec.passed_checks),
    failed_checks: asNum(rec.failed_checks),
    held_checks: asNum(rec.held_checks),
    unauthorized_attempts: asNum(rec.unauthorized_attempts),
    external_actions: asNum(rec.external_actions),
    customer_data_touched: asNum(rec.customer_data_touched),
    destructive_attempts: asNum(rec.destructive_attempts)
  };
  const status = rec.status ?? rec.run_status ?? rec.gate_status ?? null;
  const runId = rec.run_id ?? rec.proof_run_id ?? rec.id ?? null;

  const expected =
    String(status).toUpperCase() === "HOLD" &&
    counts.total_checks === 10 &&
    counts.passed_checks === 10 &&
    counts.failed_checks === 0 &&
    counts.held_checks === 1 &&
    counts.unauthorized_attempts === 0 &&
    counts.external_actions === 0 &&
    counts.customer_data_touched === 0 &&
    counts.destructive_attempts === 0;

  if (!expected) {
    return hold("UNEXPECTED_PROOF_RUN_STATE", {
      run_id: runId,
      version: CANONICAL_VERSION,
      status,
      check_counts: counts
    });
  }

  return json({
    ok: true,
    gate: "HOLD",
    action: ALLOWED_ACTION,
    version: CANONICAL_VERSION,
    run_id: runId,
    status,
    check_counts: counts,
    held_check: rec.held_check ?? rec.final_check ?? "REAL_E2E_PROOF = VERIFIED_REQUIRED",
    production_accessed: false,
    next_step: "Do not continue to proof binding in this gate."
  });
});
