import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TEST_PROJECT_REF = "bgsbuepolooybdqrzmoa";
const ALLOWED_ACTION = "PREPARE_CUSTOMER_ACTION_FIXTURE";
const CANONICAL_VERSION = "533.1";
const CANONICAL_RPC = "ils_prepare_customer_action_e2e_controlled_fixture";
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

const SAFETY_KEYS = [
  "real_external_action_allowed",
  "real_customer_data_allowed",
  "payment_allowed",
  "government_submission_allowed",
  "professional_execution_allowed",
  "destructive_allowed"
] as const;

const SAFETY_ALIASES: Record<string, string[]> = {
  real_external_action_allowed: ["real_external_execution_allowed"],
  real_customer_data_allowed: ["customer_data_allowed"],
  payment_allowed: ["payment_invocation_allowed"],
  government_submission_allowed: ["government_action_allowed"],
  professional_execution_allowed: ["professional_action_allowed"],
  destructive_allowed: ["destructive_operation_allowed"]
};

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

function readFlag(row: Record<string, unknown>, key: string): unknown {
  if (key in row) return row[key];
  for (const alias of SAFETY_ALIASES[key] || []) {
    if (alias in row) return row[alias];
  }
  return undefined;
}

function asBool(v: unknown): boolean | null {
  if (v === false || v === "false" || v === 0) return false;
  if (v === true || v === "true" || v === 1) return true;
  return null;
}

function fixtureReady(status: unknown): boolean {
  const s = String(status || "").toLowerCase();
  return ["ready", "success", "successful", "ok", "prepared", "complete", "completed"].includes(s);
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

  const { data: fixture, error: rpcError } = await admin.rpc(CANONICAL_RPC, {
    p_version: CANONICAL_VERSION
  });
  if (rpcError) {
    return hold("FIXTURE_PREPARE_FAILED", { message: rpcError.message }, 502);
  }

  const row = Array.isArray(fixture) ? fixture[0] : fixture;
  if (!row || typeof row !== "object") {
    return hold("FIXTURE_RESPONSE_INVALID");
  }
  const rec = row as Record<string, unknown>;

  const flags: Record<string, boolean | null> = {};
  let unexpected = false;
  for (const key of SAFETY_KEYS) {
    const parsed = asBool(readFlag(rec, key));
    flags[key] = parsed;
    if (parsed !== false) unexpected = true;
  }
  if (unexpected) {
    return hold("UNEXPECTED_SAFETY_STATE", {
      safety_flags: flags,
      fixture_id: rec.fixture_id ?? rec.id ?? null
    });
  }

  const fixtureStatus = rec.fixture_status ?? rec.status ?? null;
  if (!fixtureReady(fixtureStatus)) {
    return hold("FIXTURE_NOT_READY", {
      fixture_status: fixtureStatus,
      fixture_id: rec.fixture_id ?? rec.id ?? null,
      safety_flags: flags
    });
  }

  return json({
    ok: true,
    gate: "HOLD",
    action: ALLOWED_ACTION,
    version: CANONICAL_VERSION,
    fixture_id: rec.fixture_id ?? rec.id ?? null,
    fixture_code: rec.fixture_code ?? null,
    fixture_status: fixtureStatus,
    gate_status: rec.gate_status ?? "HOLD",
    safety_flags: flags,
    production_accessed: false,
    next_step: "Do not continue to proof gate."
  });
});
