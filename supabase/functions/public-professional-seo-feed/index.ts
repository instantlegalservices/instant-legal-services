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

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function authorized(req: Request) {
  const expected = clean(Deno.env.get("ILS_PUBLIC_SEO_FEED_KEY"));
  if (!expected) return false;

  const supplied = clean(req.headers.get("x-ils-seo-key"));
  return supplied === expected;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return response({
      ok: false,
      code: "METHOD_NOT_ALLOWED"
    }, 405);
  }

  if (!authorized(req)) {
    return response({
      ok: false,
      code: "UNAUTHORIZED"
    }, 401);
  }

  const url = clean(Deno.env.get("SUPABASE_URL"));
  const serviceRole = clean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  if (!url || !serviceRole) {
    return response({
      ok: false,
      code: "SERVICE_CONFIG_ERROR"
    }, 503);
  }

  const admin = createClient(url, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const { data, error } = await admin
    .from("ils_public_professional_seo")
    .select("id,professional_type,full_name,state,city,specialization,years_of_experience,firm_or_organization")
    .order("professional_type", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    console.error("public-professional-seo-feed", error);
    return response({
      ok: false,
      code: "FEED_ERROR"
    }, 500);
  }

  return response(data ?? [], 200);
});
