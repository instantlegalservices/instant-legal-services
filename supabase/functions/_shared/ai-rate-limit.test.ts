import { enforceAiRateLimit } from "./ai-rate-limit.ts";

Deno.test("AI rate limiter fails closed and returns 429 with a safe hashed identity", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = Deno.env.get("SUPABASE_URL");
  const originalKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const restoreEnv = (name: string, value: string | undefined) => {
    if (value === undefined) Deno.env.delete(name);
    else Deno.env.set(name, value);
  };
  try {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ allowed: true }), { status: 200 });
    };
    const missingTrustedIp = await enforceAiRateLimit(
      new Request("https://test.invalid", { headers: { "x-forwarded-for": "203.0.113.9" } })
    );
    if (missingTrustedIp?.status !== 503 || calls !== 0) {
      throw new Error("caller-controlled forwarding header must not establish identity");
    }

    Deno.env.set("SUPABASE_URL", "https://test-project.supabase.co");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-only-secret");
    let bodyText = "";
    globalThis.fetch = async (_input, init) => {
      bodyText = String(init?.body || "");
      return new Response(JSON.stringify({ allowed: false, retry_after_seconds: 17 }), { status: 200 });
    };
    const limited = await enforceAiRateLimit(
      new Request("https://test.invalid", { headers: { "cf-connecting-ip": "203.0.113.9" } })
    );
    if (limited?.status !== 429 || limited.headers.get("Retry-After") !== "17") {
      throw new Error("limit must return 429 and Retry-After");
    }
    if (!limited.headers.get("Access-Control-Expose-Headers")?.toLowerCase().split(",").map(x => x.trim()).includes("retry-after")) {
      throw new Error("browser clients must be allowed to read Retry-After");
    }
    if (bodyText.includes("203.0.113.9")) throw new Error("raw client IP must not be sent to RPC");
    const payload = JSON.parse(bodyText);
    if (!/^[0-9a-f]{64}$/.test(payload.p_key_hash)) throw new Error("expected keyed 64-character digest");

    const windows: number[] = [];
    globalThis.fetch = async (_input, init) => {
      windows.push(JSON.parse(String(init?.body || "{}")).p_window_seconds);
      return new Response(JSON.stringify({ allowed: true, retry_after_seconds: 30 }), { status: 200 });
    };
    const allowed = await enforceAiRateLimit(
      new Request("https://test.invalid", { headers: { "cf-connecting-ip": "203.0.113.11" } })
    );
    if (allowed !== null || windows.join(",") !== "60,3600") {
      throw new Error("public requests must check minute and hour windows");
    }

    windows.length = 0;
    let advocateBody = "";
    globalThis.fetch = async (_input, init) => {
      advocateBody = String(init?.body || "");
      windows.push(JSON.parse(advocateBody).p_window_seconds);
      return new Response(JSON.stringify({ allowed: true, retry_after_seconds: 30 }), { status: 200 });
    };
    const advocateId = "00000000-0000-4000-8000-000000000001";
    const advocateAllowed = await enforceAiRateLimit(new Request("https://test.invalid"), advocateId);
    if (advocateAllowed !== null || windows.join(",") !== "60,3600") {
      throw new Error("advocate requests must check minute and hour windows without requiring a public IP");
    }
    const advocatePayload = JSON.parse(advocateBody);
    if (advocatePayload.p_limit !== 20) throw new Error("advocate minute quota must be 20");
    if (advocateBody.includes(advocateId) || !/^[0-9a-f]{64}$/.test(advocatePayload.p_key_hash)) {
      throw new Error("raw advocate UUID must not be sent to RPC");
    }

    globalThis.fetch = async () => new Response("unavailable", { status: 500 });
    const rpcFailure = await enforceAiRateLimit(
      new Request("https://test.invalid", { headers: { "cf-connecting-ip": "203.0.113.10" } })
    );
    if (rpcFailure?.status !== 503) throw new Error("RPC failure must fail closed");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("SUPABASE_URL", originalUrl);
    restoreEnv("SUPABASE_SERVICE_ROLE_KEY", originalKey);
  }
});
