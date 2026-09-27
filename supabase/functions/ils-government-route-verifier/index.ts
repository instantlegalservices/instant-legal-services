import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "authorization,x-client-info,apikey,content-type",
  "access-control-max-age": "86400"
};

function json(body: unknown, status = 200, extra: Record<string,string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...corsHeaders, ...extra } });
}
function hostAllowed(host: string, domain: string) {
  const h = host.toLowerCase().replace(/^www\./, "");
  const d = domain.toLowerCase().replace(/^www\./, "");
  return h === d || h.endsWith("." + d);
}
async function verifyAdmin(admin: any, token: string) {
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { ok: false as const, status: 401, error: "Invalid session" };
  const { data: row, error: adminError } = await admin.from("ils_admin_users").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (adminError || !row) return { ok: false as const, status: 403, error: "Admin authorization required" };
  return { ok: true as const, user_id: data.user.id };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ ok: false, error: "Bearer token required" }, 401);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = await verifyAdmin(admin, token);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  let body: { service_codes?: string[] } = {};
  try { body = await req.json(); } catch {}
  const requested = Array.isArray(body.service_codes) ? body.service_codes.map(String).map(x => x.trim()).filter(Boolean) : [];
  let query = admin.from("ils_government_route_catalog").select("id,service_code,title,official_url,official_domain,active").eq("active", true);
  if (requested.length) query = query.in("service_code", requested);
  const { data: routes, error } = await query;
  if (error) return json({ ok: false, error: error.message }, 500);

  const results = [];
  for (const route of routes || []) {
    let parsed: URL;
    try { parsed = new URL(route.official_url); }
    catch { results.push({ service_code: route.service_code, result: "FAIL", failure: "invalid_url" }); continue; }
    if (parsed.protocol !== "https:" || !hostAllowed(parsed.hostname, route.official_domain)) {
      results.push({ service_code: route.service_code, result: "FAIL", failure: "allowlist_mismatch" }); continue;
    }

    const started = Date.now();
    try {
      let current = parsed.toString();
      let redirects = 0;
      let response: Response | null = null;
      for (let hop = 0; hop <= 5; hop++) {
        response = await fetch(current, { method: "GET", redirect: "manual", headers: { "user-agent": "ILS-Government-Route-Verifier/1.0" }});
        if (![301,302,303,307,308].includes(response.status)) break;
        const location = response.headers.get("location");
        if (!location) break;
        const next = new URL(location, current);
        if (next.protocol !== "https:" || !hostAllowed(next.hostname, route.official_domain)) {
          await response.body?.cancel();
          throw new Error(`redirect_allowlist_mismatch:${next.toString()}`);
        }
        current = next.toString();
        redirects++;
        await response.body?.cancel();
      }

      if (!response) throw new Error("no_response");
      const finalUrl = current;
      const final = new URL(finalUrl);
      const domainOk = hostAllowed(final.hostname, route.official_domain);
      const httpsOk = final.protocol === "https:";
      const ok = response.status >= 200 && response.status < 400 && domainOk && httpsOk;
      const verificationError = ok ? null : `status=${response.status};domain_ok=${domainOk};https_ok=${httpsOk}`;
      try { await response.body?.cancel(); } catch {}

      const { error: updateError } = await admin.from("ils_government_route_catalog").update({
        verification_status: ok ? "verified" : "pending",
        source_checked_at: new Date().toISOString(),
        last_http_status: response.status,
        last_final_url: finalUrl,
        last_redirect_count: redirects,
        last_verified_at: ok ? new Date().toISOString() : null,
        verification_error: verificationError
      }).eq("id", route.id);

      results.push({ service_code: route.service_code, title: route.title, result: ok ? "PASS" : "HOLD", http_status: response.status, final_url: finalUrl, redirect_count: redirects, domain_ok: domainOk, https_ok: httpsOk, update_error: updateError?.message || null, duration_ms: Date.now() - started });
    } catch (error) {
      const message = String((error as Error)?.message || error);
      await admin.from("ils_government_route_catalog").update({ verification_status: "pending", source_checked_at: new Date().toISOString(), last_verified_at: null, verification_error: message }).eq("id", route.id);
      results.push({ service_code: route.service_code, title: route.title, result: "HOLD", failure: message, duration_ms: Date.now() - started });
    }
  }
  return json({ ok: true, checked: results.length, results });
});