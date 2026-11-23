const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "Retry-After"
};

function unavailable() {
  return new Response(JSON.stringify({
    ok: false,
    code: "AI_RATE_LIMIT_UNAVAILABLE",
    reply: "AI service is temporarily unavailable. Please try again shortly."
  }), {
    status: 503,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function limited(retry: number) {
  return new Response(JSON.stringify({
    ok: false,
    code: "AI_RATE_LIMITED",
    reply: "Too many AI requests. Please wait before trying again."
  }), {
    status: 429,
    headers: {
      ...CORS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": String(Math.max(1, Math.ceil(retry)))
    }
  });
}

async function check(identity: string, limit: number, windowSeconds: 60 | 3600) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("rate-limit service configuration missing");

  const hmacKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", hmacKey, new TextEncoder().encode(identity));
  const keyHash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");

  const response = await fetch(`${url}/rest/v1/rpc/ils_ai_rate_limit_check`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_key_hash: keyHash,
      p_limit: limit,
      p_window_seconds: windowSeconds
    })
  });
  if (!response.ok) throw new Error(`rate-limit RPC HTTP ${response.status}`);
  const result = await response.json();
  if (typeof result?.allowed !== "boolean") throw new Error("invalid rate-limit RPC response");
  return result;
}

/**
 * Public callers are identified only by Cloudflare's ingress header.
 * Never trust X-Forwarded-For or X-Real-IP supplied by the caller.
 * Approved advocates use the authenticated Supabase user UUID instead.
 */
export async function enforceAiRateLimit(req: Request, advocateUserId?: string) {
  let identity: string;
  let limitPerMinute: number;
  let limitPerHour: number;

  if (advocateUserId) {
    identity = `advocate:${advocateUserId}`;
    limitPerMinute = 20;
    limitPerHour = 200;
  } else {
    const ip = (req.headers.get("cf-connecting-ip") || "").trim();
    if (!ip || ip.length > 64 || ip.includes(",") || ip.split("").some(char => char.charCodeAt(0) <= 32)) {
      return unavailable();
    }
    identity = `public:${ip}`;
    limitPerMinute = 10;
    limitPerHour = 60;
  }

  try {
    const minute = await check(identity, limitPerMinute, 60);
    if (!minute.allowed) return limited(minute.retry_after_seconds || 60);
    const hour = await check(identity, limitPerHour, 3600);
    if (!hour.allowed) return limited(hour.retry_after_seconds || 3600);
    return null;
  } catch (error) {
    console.error("AI_RATE_LIMIT_UNAVAILABLE", error);
    return unavailable();
  }
}
