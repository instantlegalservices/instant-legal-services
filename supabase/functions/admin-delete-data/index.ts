import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

async function getUser(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error || !data.user ? null : data.user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "POST request required" }, 405);

  try {
    const actor = await getUser(req);
    if (!actor) return json({ ok: false, message: "Valid administrator session required." }, 401);

    const { data: adminRow, error: adminError } = await admin
      .from("ils_admin_users").select("user_id").eq("user_id", actor.id).maybeSingle();
    if (adminError || !adminRow) return json({ ok: false, message: "Administrator authorization required." }, 403);

    const body = await req.json();
    const entityType = String(body?.entity_type || "").trim();
    const entityId = String(body?.entity_id || "").trim();
    const confirm = String(body?.confirm || "");
    const allowed = ["advocate", "professional", "client", "order"];
    if (!allowed.includes(entityType) || !entityId) return json({ ok: false, message: "Invalid deletion target." }, 400);
    if (confirm !== "DELETE PERMANENTLY") return json({ ok: false, message: "Exact deletion confirmation required." }, 400);

    const { data, error } = await admin.rpc("ils_admin_delete_data", {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_actor_user_id: actor.id
    });
    if (error) return json({ ok: false, message: error.message }, 403);
    if (!data?.ok) return json({ ok: false, message: "Deletion was not completed." }, 500);

    const storage = Array.isArray(data.storage) ? data.storage : [];
    const storageResults = [];
    for (const item of storage) {
      const bucket = String(item?.bucket || "");
      const path = String(item?.path || "");
      if (!bucket || !path) continue;
      const { error: storageError } = await admin.storage.from(bucket).remove([path]);
      storageResults.push({ bucket, path, ok: !storageError, error: storageError?.message || null });
    }

    let authDeleted = false;
    let authDeleteSkipped = false;
    let authDeleteError: string | null = null;
    const targetUser = data.auth_user_id ? String(data.auth_user_id) : "";
    if (targetUser) {
      if (targetUser === actor.id) {
        authDeleteSkipped = true;
        authDeleteError = "Target account matches current administrator; account deletion was blocked.";
      } else {
        const [a, p, c] = await Promise.all([
          admin.from("advocate_registrations").select("id").eq("auth_user_id", targetUser).limit(1),
          admin.from("professional_join_requests").select("id").eq("auth_user_id", targetUser).limit(1),
          admin.from("customer_profiles").select("id").eq("user_id", targetUser).limit(1)
        ]);
        if ((a.data?.length || 0) + (p.data?.length || 0) + (c.data?.length || 0) > 0) {
          authDeleteSkipped = true;
          authDeleteError = "Auth account retained because another profile still references it.";
        } else {
          const result = await admin.auth.admin.deleteUser(targetUser);
          authDeleted = !result.error;
          authDeleteError = result.error?.message || null;
        }
      }
    }

    const storageFailed = storageResults.filter(x => !x.ok);
    return json({
      ok: true,
      message: storageFailed.length || authDeleteError
        ? "Database deletion completed; cleanup requires review."
        : "Permanent deletion completed successfully.",
      entity_type: entityType,
      entity_id: entityId,
      auth_deleted: authDeleted,
      auth_delete_skipped: authDeleteSkipped,
      auth_delete_error: authDeleteError,
      storage: storageResults,
      summary: data.summary || {}
    });
  } catch (error) {
    console.error("Admin deletion:", error);
    return json({ ok: false, message: error?.message || "Unexpected server error." }, 500);
  }
});
