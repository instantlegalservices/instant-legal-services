import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, message: "Only POST requests are allowed.", code: "METHOD_NOT_ALLOWED" });
  }

  let body: Record<string, unknown> = {};
  let createdUserId: string | null = null;
  let uploadedPhotoPath: string | null = null;
  let admin: ReturnType<typeof createClient> | null = null;

  try {
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, message: "Invalid registration request.", code: "INVALID_JSON" });
    }

    const advocateName = clean(body.advocate_name);
    const email = clean(body.email).toLowerCase();
    const mobile = clean(body.mobile);
    const enrollmentNumber = clean(body.enrollment_number);
    const enrollmentYear = Number(body.enrollment_year);
    const stateBarCouncil = clean(body.state_bar_council);
    const practiceState = clean(body.practice_state);
    const district = clean(body.district);
    const courtName = clean(body.court_name);
    const yearsOfPractice = Number(body.years_of_practice);
    const password = String(body.password ?? "");
    const undertakingAccepted = body.undertaking_accepted === true;
    const undertakingSignedName = clean(body.undertaking_signed_name);
    const photoPath = clean(body.photo_storage_path);

    const missing: string[] = [];
    if (!advocateName) missing.push("advocate name");
    if (!email) missing.push("email");
    if (!mobile) missing.push("mobile");
    if (!enrollmentNumber) missing.push("enrollment number");
    if (!clean(body.enrollment_year)) missing.push("enrollment year");
    if (!stateBarCouncil) missing.push("state bar council");
    if (!practiceState) missing.push("practising state");
    if (!courtName) missing.push("court / jurisdiction");
    if (!clean(body.primary_practice_area)) missing.push("practice area");
    if (!clean(body.years_of_practice)) missing.push("years of practice");
    if (!password) missing.push("password");
    if (!photoPath) missing.push("profile photo");
    if (!undertakingAccepted) missing.push("ILS undertaking acceptance");
    if (!undertakingSignedName) missing.push("undertaking signature");

    if (missing.length) {
      return json({
        ok: false,
        message: `Please complete: ${missing.join(", ")}.`,
        code: "VALIDATION_ERROR",
      });
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return json({ ok: false, message: "Valid professional email is required.", code: "INVALID_EMAIL" });
    }

    if (!/^[0-9]{10}$/.test(mobile)) {
      return json({ ok: false, message: "Valid 10 digit mobile number is required.", code: "INVALID_MOBILE" });
    }

    if (!Number.isInteger(enrollmentYear) || enrollmentYear < 1950 || enrollmentYear > new Date().getFullYear()) {
      return json({ ok: false, message: "Valid enrollment year is required.", code: "INVALID_ENROLLMENT_YEAR" });
    }

    if (!Number.isFinite(yearsOfPractice) || yearsOfPractice < 0 || yearsOfPractice > 80) {
      return json({ ok: false, message: "Valid years of practice is required.", code: "INVALID_EXPERIENCE" });
    }

    if (password.length < 8) {
      return json({ ok: false, message: "Password must contain at least 8 characters.", code: "INVALID_PASSWORD" });
    }

    if (undertakingSignedName.toLowerCase() !== advocateName.toLowerCase()) {
      return json({ ok: false, message: "Undertaking signature must match the advocate's full name.", code: "SIGNATURE_MISMATCH" });
    }

    if (!photoPath.startsWith("pending/")) {
      return json({ ok: false, message: "Invalid private photo path.", code: "INVALID_PHOTO_PATH" });
    }

    // District is intentionally optional for High Court / Supreme Court registrations.
    // Local courts still require a district on the client side and will be stored as district — court.
    const selectedCourts = Array.isArray(body.court_selections)
      ? body.court_selections.map(clean).filter(Boolean)
      : [];

    const higherCourtOnly = selectedCourts.length > 0 && selectedCourts.every((court) =>
      ["High Court", "Supreme Court of India"].includes(court)
    );

    if (!district && !higherCourtOnly) {
      return json({
        ok: false,
        message: "Please select your district for the selected local court.",
        code: "DISTRICT_REQUIRED",
      });
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !serviceRole) {
      console.error("register-advocate: required Supabase environment variables are missing");
      return json({ ok: false, message: "Registration service is temporarily unavailable. Please try again later.", code: "SERVICE_CONFIG_ERROR" });
    }

    admin = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // The photo has already been uploaded by the browser. Keep the exact path for cleanup on failure.
    uploadedPhotoPath = photoPath;

    const { data: existing, error: existingError } = await admin
      .from("advocate_registrations")
      .select("id")
      .ilike("email", email)
      .limit(1);

    if (existingError) {
      console.error("register-advocate existing-registration lookup:", existingError);
      return json({ ok: false, message: "Unable to verify this email right now. Please try again.", code: "REGISTRATION_LOOKUP_ERROR" });
    }

    if ((existing ?? []).length > 0) {
      return json({
        ok: false,
        message: "An advocate registration already exists for this email address.",
        code: "DUPLICATE_REGISTRATION",
      });
    }

    const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });

    if (usersError) {
      console.error("register-advocate auth user lookup:", usersError);
      return json({ ok: false, message: "Unable to verify the login account right now. Please try again.", code: "AUTH_LOOKUP_ERROR" });
    }

    const emailExists = (users?.users ?? []).some(
      (user) => clean(user.email).toLowerCase() === email
    );

    if (emailExists) {
      return json({
        ok: false,
        message: "This email is already registered for a login account. Please use another email address.",
        code: "DUPLICATE_AUTH_EMAIL",
      });
    }

    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: "advocate",
        advocate_name: advocateName,
        registration_pending: true,
      },
    });

    if (authError || !created?.user) {
      console.error("register-advocate create auth user:", authError);
      return json({
        ok: false,
        message: authError?.message || "Unable to create secure login account. Please try again.",
        code: "AUTH_CREATE_ERROR",
      });
    }

    createdUserId = created.user.id;

    const districtCourt = district
      ? `${district} — ${courtName}`
      : `Higher Court — ${courtName}`;

    const practiceAreas = Array.isArray(body.practice_areas)
      ? body.practice_areas.map(clean).filter(Boolean).slice(0, 4)
      : clean(body.primary_practice_area)
          .split("|")
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 4);

    if (practiceAreas.length === 0) {
      await admin.auth.admin.deleteUser(createdUserId);
      createdUserId = null;
      return json({ ok: false, message: "Please select at least one practice area.", code: "PRACTICE_AREA_REQUIRED" });
    }

    const { data: inserted, error: insertError } = await admin
      .from("advocate_registrations")
      .insert([{
        advocate_name: advocateName,
        mobile,
        email,
        enrollment_number: enrollmentNumber,
        enrollment_year: enrollmentYear,
        state_bar_council: stateBarCouncil,
        practice_state: practiceState,
        district_court: districtCourt,
        primary_practice_area: practiceAreas.join(" | "),
        years_of_practice: yearsOfPractice,
        status: "Pending",
        verification_status: "Pending",
        public_profile: false,
        admin_notes: `ILS professional ethics undertaking accepted on ${new Date().toISOString()}`,
        photo_url: null,
        photo_storage_path: photoPath,
        auth_user_id: createdUserId,
        undertaking_accepted: true,
        undertaking_signed_name: undertakingSignedName,
        undertaking_signed_at: new Date().toISOString(),
      }])
      .select("id")
      .single();

    if (insertError || !inserted?.id) {
      console.error("register-advocate registration insert:", insertError);
      if (createdUserId) {
        await admin.auth.admin.deleteUser(createdUserId).catch((cleanupError) => {
          console.error("register-advocate auth cleanup:", cleanupError);
        });
        createdUserId = null;
      }

      return json({
        ok: false,
        message: insertError?.message || "Unable to save the advocate registration. Please try again.",
        code: "REGISTRATION_INSERT_ERROR",
      });
    }

    return json({
      ok: true,
      advocate_id: inserted.id,
      message: "Registration submitted successfully. Your profile and photo are pending admin verification.",
    });
  } catch (error) {
    console.error("register-advocate unexpected error:", error);

    if (admin && createdUserId) {
      await admin.auth.admin.deleteUser(createdUserId).catch((cleanupError) => {
        console.error("register-advocate unexpected auth cleanup:", cleanupError);
      });
    }

    return json({
      ok: false,
      message: "Registration could not be completed right now. Please try again.",
      code: "REGISTRATION_SERVICE_ERROR",
    });
  }
});