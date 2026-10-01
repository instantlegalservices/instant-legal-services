import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) throw new Error("Missing admin session.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !userData.user) throw new Error("Invalid or expired admin session.");

    const callerEmail = (userData.user.email || "").toLowerCase();
    if (callerEmail !== "fahat29@gmail.com") {
      throw new Error("Administrator access required.");
    }

    const body = await req.json();
    const advocateId = Number(body?.advocate_id);
    const requestedEmail = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    if (!Number.isFinite(advocateId) || advocateId <= 0) throw new Error("Invalid advocate ID.");
    if (password.length < 8) throw new Error("Password must contain at least 8 characters.");

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: advocate, error: advocateError } = await adminClient
      .from("advocate_registrations")
      .select("id,advocate_name,email,status,verification_status")
      .eq("id", advocateId)
      .single();

    if (advocateError) throw advocateError;

    const verification = advocate.verification_status || advocate.status;
    if (verification !== "Approved") throw new Error("Advocate must be approved before login creation.");
    const email = String(requestedEmail || advocate.email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Valid advocate email is required.");

    let authUserId: string | null = null;

    const { data: existingList, error: listError } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listError) throw listError;

    const existing = existingList.users.find((u) => (u.email || "").toLowerCase() === email);

    if (existing) {
      authUserId = existing.id;
      const { error } = await adminClient.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
        user_metadata: {
          ...(existing.user_metadata || {}),
          role: "advocate",
          advocate_id: advocateId,
          advocate_name: advocate.advocate_name || "",
        },
      });
      if (error) throw error;
    } else {
      const { data: created, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          role: "advocate",
          advocate_id: advocateId,
          advocate_name: advocate.advocate_name || "",
        },
      });
      if (error) throw error;
      authUserId = created.user?.id || null;
    }

    // Update the advocate row only if an auth_user_id column already exists.
    // This keeps the function compatible with the existing database while
    // allowing future RPCs to use the explicit mapping.
    if (authUserId) {
      const { error: mappingError } = await adminClient
        .from("advocate_registrations")
        .update({ auth_user_id: authUserId })
        .eq("id", advocateId);

      if (mappingError && !/auth_user_id|column/i.test(mappingError.message || "")) {
        throw mappingError;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, advocate_id: advocateId, auth_user_id: authUserId, email }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, message: error?.message || "Unable to create advocate login." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
