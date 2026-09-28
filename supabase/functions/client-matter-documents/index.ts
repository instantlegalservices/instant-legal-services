import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const BUCKET = "client-matter-documents";
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
async function getAuthUser(req: Request) {
  const h = req.headers.get("Authorization");
  if (!h) return null;
  const token = h.replace("Bearer ", "").trim();
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  return error || !data.user ? null : data.user;
}
async function getClientByAccess(accessToken: string, mobile: string) {
  const { data, error } = await supabaseAdmin.from("client_requirements")
    .select("id, client_name, assigned_advocate_id, client_access_expires_at")
    .eq("client_access_token", accessToken).eq("mobile", mobile).limit(1).maybeSingle();
  if (error || !data) return null;
  if (data.client_access_expires_at && new Date(data.client_access_expires_at) <= new Date()) return null;
  return data;
}
async function getClientById(clientId: number) {
  const { data, error } = await supabaseAdmin.from("client_requirements")
    .select("id, client_name, assigned_advocate_id").eq("id", clientId).maybeSingle();
  return error || !data ? null : data;
}
async function isAdmin(user: any) { return user?.email === "fahat29@gmail.com"; }
async function isAssignedAdvocate(user: any, clientId: number) {
  if (!user?.email) return false;
  const { data: advocate } = await supabaseAdmin.from("advocate_registrations")
    .select("id, email").eq("email", user.email).eq("verification_status", "Approved").maybeSingle();
  if (!advocate) return false;
  const { data: assignment } = await supabaseAdmin.from("advocate_assignments")
    .select("id").eq("lead_id", clientId).eq("advocate_id", advocate.id)
    .in("status", ["Assigned", "Active"]).maybeSingle();
  return !!assignment;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") return json({ ok: false, message: "POST request required" }, 405);
    const contentType = req.headers.get("content-type") || "";
    let action = "", clientId: number | null = null, accessToken = "", mobile = "", documentId: number | null = null, file: File | null = null;
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      action = String(form.get("action") || "");
      clientId = form.get("client_id") ? Number(form.get("client_id")) : null;
      accessToken = String(form.get("access_token") || "");
      mobile = String(form.get("mobile") || "");
      const f = form.get("file");
      if (f instanceof File) file = f;
    } else {
      const body = await req.json();
      action = String(body.action || "");
      clientId = body.client_id ? Number(body.client_id) : null;
      accessToken = String(body.access_token || "");
      mobile = String(body.mobile || "");
      documentId = body.document_id ? Number(body.document_id) : null;
    }
    const user = await getAuthUser(req);
    let targetClient: any = null;
    if (accessToken && mobile) {
      targetClient = await getClientByAccess(accessToken, mobile);
      if (!targetClient) return json({ ok: false, message: "Invalid or expired client access." }, 403);
    }
    if (!targetClient && clientId) {
      targetClient = await getClientById(clientId);
      if (!targetClient) return json({ ok: false, message: "Client matter not found." }, 404);
    }
    if (!targetClient) return json({ ok: false, message: "Client matter could not be identified." }, 400);
    const adminAccess = await isAdmin(user);
    const advocateAccess = await isAssignedAdvocate(user, targetClient.id);
    const clientAccess = !!(accessToken && mobile);
    if (!adminAccess && !advocateAccess && !clientAccess) return json({ ok: false, message: "You are not authorized for this matter." }, 403);

    if (action === "list") {
      const { data, error } = await supabaseAdmin.from("client_matter_documents")
        .select("id, lead_id, file_name, storage_path, uploaded_by_role, uploaded_by_name, mime_type, file_size, client_visible, created_at")
        .eq("lead_id", targetClient.id).order("created_at", { ascending: false });
      if (error) return json({ ok: false, message: error.message }, 500);
      const visibleDocuments = clientAccess ? (data || []).filter((d) => d.client_visible === true) : (data || []);
      const documents = await Promise.all(visibleDocuments.map(async (doc) => {
        const { data: signed, error: signedError } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(doc.storage_path, 300);
        return { id: doc.id, lead_id: doc.lead_id, file_name: doc.file_name, uploaded_by_role: doc.uploaded_by_role, uploaded_by_name: doc.uploaded_by_name, mime_type: doc.mime_type, file_size: doc.file_size, client_visible: doc.client_visible, created_at: doc.created_at, signed_url: signedError ? null : signed?.signedUrl || null };
      }));
      return json({ ok: true, documents });
    }

    if (action === "upload") {
      if (!file) return json({ ok: false, message: "Please select a document." }, 400);
      if (file.size > MAX_FILE_SIZE) return json({ ok: false, message: "Maximum file size is 15 MB." }, 400);
      if (file.size <= 0) return json({ ok: false, message: "Invalid empty file." }, 400);
      let uploaderRole = "client", uploaderName = targetClient.client_name || "Client";
      if (adminAccess) { uploaderRole = "admin"; uploaderName = "Instant Legal Services"; }
      else if (advocateAccess) {
        uploaderRole = "advocate";
        const { data: advocate } = await supabaseAdmin.from("advocate_registrations").select("advocate_name").eq("email", user.email).maybeSingle();
        uploaderName = advocate?.advocate_name || "Assigned Advocate";
      }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 150);
      const storagePath = `${targetClient.id}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, await file.arrayBuffer(), { contentType: file.type || "application/octet-stream", upsert: false });
      if (uploadError) return json({ ok: false, message: "Storage upload failed: " + uploadError.message }, 500);
      const { data: inserted, error: dbError } = await supabaseAdmin.from("client_matter_documents").insert({ lead_id: targetClient.id, file_name: file.name, storage_path: storagePath, uploaded_by_role: uploaderRole, uploaded_by_name: uploaderName, mime_type: file.type || "application/octet-stream", file_size: file.size, client_visible: true }).select("id").single();
      if (dbError) { await supabaseAdmin.storage.from(BUCKET).remove([storagePath]); return json({ ok: false, message: "Document record failed: " + dbError.message }, 500); }
      return json({ ok: true, message: "Document uploaded successfully.", document_id: inserted.id });
    }

    if (action === "download") {
      if (!documentId) return json({ ok: false, message: "Document ID required." }, 400);
      const { data: document, error } = await supabaseAdmin.from("client_matter_documents")
        .select("id, lead_id, file_name, storage_path, client_visible").eq("id", documentId).maybeSingle();
      if (error || !document) return json({ ok: false, message: "Document not found." }, 404);
      if (clientAccess && document.client_visible !== true) return json({ ok: false, message: "This document is not available to the client." }, 403);
      if (document.lead_id !== targetClient.id) return json({ ok: false, message: "Document does not belong to this matter." }, 403);
      const { data: signed, error: signedError } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(document.storage_path, 300);
      if (signedError || !signed?.signedUrl) return json({ ok: false, message: "Unable to create secure document link." }, 500);
      return json({ ok: true, file_name: document.file_name, signed_url: signed.signedUrl });
    }
    return json({ ok: false, message: "Unknown action." }, 400);
  } catch (error) {
    console.error(error);
    return json({ ok: false, message: error?.message || "Unexpected server error." }, 500);
  }
});
