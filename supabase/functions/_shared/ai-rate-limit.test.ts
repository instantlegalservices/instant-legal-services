import { enforceAiRateLimit } from "./ai-rate-limit.ts";

const originalFetch = globalThis.fetch;
const originalUrl = Deno.env.get("SUPABASE_URL");
const originalKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) Deno.env.delete(name);
  else Deno.env.set(name, value);
}

Deno.test("missing trusted client IP fails closed without RPC", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ allowed: true }), { status: 200 });
  };
  const response = await enforceAiRateLimit(new Request("https://test.invalid", { headers: { "x-forwarded-for": "203.0.113.9" } }));
  if (response?.status !== 503) throw new Error("expected 503 when trusted IP is missing");
  if (calls !== 0) throw new Error("must not call RPC without trusted identity");
});

Deno.test("RPC limit returns 429 with Retry-After and never sends raw identity", async () => {
  Deno.env.set("SUPABASE_URL", "https://test-project.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-only-secret");
  let bodyText = "";
  globalThis.fetch = async (_input, init) => {
    bodyText = String(init?.body || "");
    return new Response(JSON.stringify({ allowed: false, retry_after_seconds: 17 }), { status: 200 });
  };
  const response = await enforceAiRateLimit(new Request("https://test.invalid", { headers: { "cf-connecting-ip": "203.0.113.9" } }));
  if (response?.status !== 429) throw new Error("expected 429");
  if (response.headers.get("Retry-After") !== "17") throw new Error("expected Retry-After 17");
  if (bodyText.includes("203.0.113.9")) throw new Error("raw client IP must not be sent to RPC");
  const payload = JSON.parse(bodyText);
  if (!/^[0-9a-f]{64}$/.test(payload.p_key_hash)) throw new Error("expected keyed 64-character digest");
});

Deno.test("RPC failure fails closed with 503", async () => {
  Deno.env.set("SUPABASE_URL", "https://test-project.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-only-secret");
  globalThis.fetch = async () => new Response("unavailable", { status: 500 });
  const response = await enforceAiRateLimit(new Request("https://test.invalid", { headers: { "cf-connecting-ip": "203.0.113.10" } }));
  if (response?.status !== 503) throw new Error("expected 503 when RPC fails");
});

Deno.test("successful public request checks minute and hour windows", async () => {
  Deno.env.set("SUPABASE_URL", "https://test-project.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-only-secret");
  const windows: number[] = [];
  globalThis.fetch = async (_input, init) => {
    windows.push(JSON.parse(String(init?.body || "{}")).p_window_seconds);
    return new Response(JSON.stringify({ allowed: true, retry_after_seconds: 30 }), { status: 200 });
  };
  const response = await enforceAiRateLimit(new Request("https://test.invalid", { headers: { "cf-connecting-ip": "203.0.113.11" } }));
  if (response !== null) throw new Error("expected allowed request");
  if (windows.join(",") !== "60,3600") throw new Error("expected minute then hour check");
});

globalThis.fetch = originalFetch;
restoreEnv("SUPABASE_URL", originalUrl);
restoreEnv("SUPABASE_SERVICE_ROLE_KEY", originalKey);
