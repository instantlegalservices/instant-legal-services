import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300"
    }
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return response({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  }

  const url = String(Deno.env.get("SUPABASE_URL") || "").trim();
  const serviceRole = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();

  if (!url || !serviceRole) {
    return response({ ok: false, code: "SERVICE_CONFIG_ERROR" }, 503);
  }

  const admin = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await admin
    .from("ils_public_professional_seo")
    .select(
      "id,professional_type,full_name,state,city,specialization,years_of_experience,firm_or_organization"
    )
    .order("professional_type", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    console.error("public-professional-seo-feed", error);
    return response({ ok: false, code: "FEED_ERROR" }, 500);
  }

  return response(data ?? [], 200);
});
