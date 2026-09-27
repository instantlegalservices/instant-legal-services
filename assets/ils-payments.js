/* =========================================================
   ILS PAYMENT ENGINE
   Uses existing Supabase + Razorpay Edge Functions
   Does NOT modify existing CRM/admin functions.
========================================================= */

(function () {
  "use strict";

  const PAYMENT_FUNCTION = "razorpay-payments";

  function getClient() {
    if (window.supabaseClient) return window.supabaseClient;

    try {
      if (typeof supabaseClient !== "undefined" && supabaseClient) {
        window.supabaseClient = supabaseClient;
        return supabaseClient;
      }
    } catch (e) {}

    /* Defensive fallback: payment/session code must not depend on
       another module having already published the shared client. */
    try {
      if (window.supabase?.createClient) {
        const client = window.supabase.createClient(
          "https://odqebkdzkjfxzyzbrndt.supabase.co",
          "sb_publishable_D5eFcgWFELtnym0K74inYg_BGn7rRUi",
          {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true
            }
          }
        );
        window.supabaseClient = client;
        return client;
      }
    } catch (e) {
      console.error("ILS Supabase client initialization failed:", e);
    }

    return null;
  }

  function getSupabaseUrl() {
    return window.ILS_SUPABASE_URL ||
      "https://odqebkdzkjfxzyzbrndt.supabase.co";
  }

  function esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function ensureLogin() {
    const sb = getClient();

    if (!sb) {
      throw new Error("Supabase connection unavailable.");
    }

    const {
      data: { session }
    } = await sb.auth.getSession();

    if (session?.user) {
      return session;
    }

    throw new Error(
      "Please login before making a payment."
    );
  }

  async function createOrder(
    serviceSlug,
    details = {},
    toolRunId = null
  ) {
    const sb = getClient();

    if (!sb) {
      throw new Error("Supabase connection unavailable.");
    }

    await ensureLogin();

    const { data, error } = await sb.rpc(
      "ils_create_service_order",
      {
        p_service_slug: String(serviceSlug || "").trim(),
        p_details: details || {},
        p_tool_run_id: toolRunId || null
      }
    );

    if (error) {
      console.error(
        "ILS order creation error:",
        error
      );
      throw new Error(
        error.message || "Unable to create order."
      );
    }

    if (!data?.ok || !data?.order_id) {
      throw new Error(
        data?.message ||
        data?.error ||
        "Order creation failed."
      );
    }

    return data;
  }

  async function callPaymentFunction(payload) {
    const sb = getClient();

    if (!sb) {
      throw new Error("Supabase connection unavailable.");
    }

    const { data, error } =
      await sb.functions.invoke(
        PAYMENT_FUNCTION,
        {
          body: payload
        }
      );

    if (error) {
      console.error(
        "Razorpay function error:",
        error
      );
      throw new Error(
        error.message ||
        "Payment service unavailable."
      );
    }

    if (!data?.ok) {
      throw new Error(
        data?.message ||
        data?.error ||
        "Payment request failed."
      );
    }

    return data;
  }

  function loadRazorpayScript() {
    return new Promise((resolve, reject) => {

      if (window.Razorpay) {
        resolve();
        return;
      }

      const existing =
        document.querySelector(
          'script[src*="checkout.razorpay.com"]'
        );

      if (existing) {
        existing.addEventListener(
          "load",
          resolve,
          { once: true }
        );

        existing.addEventListener(
          "error",
          () => reject(
            new Error(
              "Unable to load Razorpay."
            )
          ),
          { once: true }
        );

        return;
      }

      const script =
        document.createElement("script");

      script.src =
        "https://checkout.razorpay.com/v1/checkout.js";

      script.async = true;

      script.onload = resolve;

      script.onerror = () =>
        reject(
          new Error(
            "Unable to load Razorpay."
          )
        );

      document.head.appendChild(script);
    });
  }

  async function startUpiProofPayment(order, options = {}) {
    const sb = getClient();
    if (!sb) throw new Error("Supabase connection unavailable.");
    if (!order?.order_id) throw new Error("Internal order ID missing. Please try again.");

    const statusEl = document.getElementById("paymentStatus");
    if (!statusEl) throw new Error("Payment screen is unavailable.");

    const amount = Number(order.amount || 0);
    const upiId = "8445609837@axl";
    const upiLink =
      "upi://pay?pa=" + encodeURIComponent(upiId) +
      "&pn=" + encodeURIComponent("Instant Legal Services") +
      "&am=" + encodeURIComponent(amount.toFixed(2)) +
      "&cu=INR" +
      "&tn=" + encodeURIComponent(order.order_number || "ILS Legal Service");

    statusEl.className = "statusline show ok";
    statusEl.innerHTML = `
      <div style="text-align:center;padding:8px 0">
        <h3 style="margin:0 0 8px">Secure Payment</h3>
        <p style="margin:6px 0">Use the existing Instant Legal Services UPI QR/payment flow.</p>
        <p style="font-size:24px;font-weight:700;margin:10px 0">₹${amount.toLocaleString("en-IN")}</p>
        <img src="assets/ils-upi-qr.jpg" alt="Instant Legal Services UPI QR"
             style="width:min(280px,85vw);max-width:100%;background:#fff;padding:10px;border-radius:14px">
        <p style="margin-top:10px"><strong>UPI ID:</strong> ${esc(upiId)}</p>
        <a href="${upiLink}" class="btn btn-primary" style="display:inline-block;margin-top:8px;text-decoration:none">Pay via UPI App</a>
        <div id="upiProofPanel" style="margin-top:14px;padding:14px;border:1px solid rgba(255,255,255,.12);border-radius:12px;text-align:left">
          <strong>After payment: submit proof</strong>
          <p style="margin:6px 0 10px;opacity:.82">Upload the successful-payment screenshot showing Instant Legal Services as the payee and the exact payment amount.</p>
          <label for="upiTransactionRef">UPI Transaction ID / UTR</label>
          <input id="upiTransactionRef" type="text" maxlength="40" autocomplete="off" placeholder="Enter transaction ID / UTR"
                 style="display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border-radius:9px">
          <label for="upiPayeeName" style="display:block;margin-top:10px">Payee name shown in screenshot</label>
          <input id="upiPayeeName" type="text" maxlength="120" autocomplete="off" placeholder="e.g. Instant Legal Services"
                 style="display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border-radius:9px">
          <label for="upiPaymentScreenshot" style="display:block;margin-top:10px">Payment-success screenshot</label>
          <input id="upiPaymentScreenshot" type="file" accept="image/jpeg,image/png,image/webp" style="display:block;margin-top:5px;width:100%">
          <small style="display:block;margin-top:7px;opacity:.75">JPG/PNG/WEBP only, maximum 5 MB. Do not upload your UPI PIN, password, OTP or other unrelated banking credentials.</small>
          <button type="button" class="btn btn-primary" id="upiPaidBtn" style="margin-top:12px;width:100%">Submit Payment Proof</button>
        </div>
        <div id="upiPaidNote" style="display:none;margin-top:14px;padding:12px;border-radius:10px"></div>
        <small style="display:block;margin-top:14px;opacity:.75;line-height:1.5">A screenshot is evidence, not an independent bank confirmation. Access is unlocked only after the proof is verified.</small>
      </div>`;

    return await new Promise((resolve, reject) => {
      const proofPanel = document.getElementById("upiProofPanel");
      const paidBtn = document.getElementById("upiPaidBtn");
      const paidNote = document.getElementById("upiPaidNote");
      if (!proofPanel || !paidBtn || !paidNote) {
        reject(new Error("Payment proof panel could not be opened."));
        return;
      }

      let checking = false;
      let timer = null;
      let attempts = 0;
      const maxAttempts = 30;

      const stopWatch = () => {
        if (timer) { clearInterval(timer); timer = null; }
      };

      const showStatus = (message, kind = "info") => {
        paidNote.style.display = "block";
        paidNote.className = "status " + (kind === "ok" ? "ok" : "");
        paidNote.innerHTML = message;
      };

      const checkVerified = async () => {
        if (checking || !order?.order_id) return;
        checking = true;
        attempts++;
        try {
          const current = getClient();
          if (!current) return;

          const { data: result, error } = await current.rpc(
            "ils_get_upi_proof_status",
            { p_order_id: order.order_id }
          );
          if (error) {
            console.debug("UPI proof status check failed.", error);
            return;
          }

          if (result?.order_status === "paid" || result?.proof_status === "verified") {
            stopWatch();
            showStatus(
              "Payment proof verified. Order <strong>" +
              esc(result.order_number || order.order_number || "") +
              "</strong> is paid. Your requested guidance is now unlocked.",
              "ok"
            );
            resolve({
              ok: true,
              status: "paid",
              order_id: order.order_id,
              order_number: result.order_number || order.order_number
            });
            return;
          }

          if (result?.proof_status === "rejected") {
            stopWatch();
            paidBtn.disabled = false;
            paidBtn.textContent = "Submit Payment Proof";
            proofPanel.style.display = "block";
            showStatus(
              "Payment proof was not verified. " +
              esc(result.message || "Please check the screenshot and transaction reference, then submit a new proof.")
            );
            return;
          }

          if (result?.proof_status === "pending") {
            showStatus(
              "Payment proof submitted for order <strong>" +
              esc(result.order_number || order.order_number || "") +
              "</strong>. Verification is still pending; access remains locked."
            );
          }

          if (attempts >= maxAttempts) {
            stopWatch();
            paidBtn.disabled = false;
            paidBtn.textContent = "Submit Payment Proof";
            showStatus("Verification is still pending. You can leave this page and return later; the order remains locked until the proof is verified.");
          }
        } finally {
          checking = false;
        }
      };

      paidBtn.onclick = async () => {
        if (timer) return;

        const file = document.getElementById("upiPaymentScreenshot")?.files?.[0];
        const transactionRef = (document.getElementById("upiTransactionRef")?.value || "").trim().replace(/[^A-Za-z0-9]/g, "");
        const payeeName = (document.getElementById("upiPayeeName")?.value || "").trim();

        if (!file) return showStatus("Please upload the payment-success screenshot first.");
        if (!["image/jpeg","image/png","image/webp"].includes(file.type)) return showStatus("Only JPG, PNG or WEBP payment screenshots are accepted.");
        if (file.size <= 0 || file.size > 5 * 1024 * 1024) return showStatus("Payment screenshot must be smaller than 5 MB.");
        if (transactionRef.length < 8 || transactionRef.length > 40) return showStatus("Enter the UPI Transaction ID / UTR shown in your payment history.");
        if (!payeeName) return showStatus("Enter the payee name exactly as shown in the payment screenshot.");

        paidBtn.disabled = true;
        paidBtn.textContent = "Submitting proof…";

        try {
          const current = getClient();
          if (!current) throw new Error("Supabase connection unavailable.");

          const { data: authData, error: authError } = await current.auth.getUser();
          if (authError || !authData?.user) throw new Error("Please sign in before submitting payment proof.");

          const arrayBuffer = await file.arrayBuffer();
          const digest = await crypto.subtle.digest("SHA-256", arrayBuffer);
          const sha256 = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");

          const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
          const uniquePart = crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2);
          const path = authData.user.id + "/" + order.order_id + "/" + Date.now() + "-" + uniquePart + "." + ext;

          const upload = await current.storage.from("payment-proofs").upload(path, file, {
            cacheControl: "3600",
            contentType: file.type,
            upsert: false
          });
          if (upload.error) throw new Error(upload.error.message || "Payment screenshot upload failed.");

          const { data: submitted, error: submitError } = await current.rpc(
            "ils_submit_upi_payment_proof",
            {
              p_order_id: order.order_id,
              p_amount: amount,
              p_upi_id: upiId,
              p_transaction_ref: transactionRef,
              p_payee_name_claimed: payeeName,
              p_screenshot_path: path,
              p_screenshot_sha256: sha256,
              p_mime_type: file.type,
              p_file_size_bytes: file.size
            }
          );

          if (submitError || !submitted?.ok) {
            await current.storage.from("payment-proofs").remove([path]);
            throw new Error(submitError?.message || submitted?.message || "Payment proof could not be submitted.");
          }

          proofPanel.style.display = "none";
          paidBtn.textContent = "Proof Submitted";
          showStatus(
            "Payment proof submitted for order <strong>" +
            esc(submitted.order_number || order.order_number || "") +
            "</strong>. Final access remains locked until the payment proof is verified.",
            "ok"
          );

          attempts = 0;
          await checkVerified();
          timer = setInterval(checkVerified, 10000);
        } catch (err) {
          console.error("UPI payment proof submission failed:", err);
          paidBtn.disabled = false;
          paidBtn.textContent = "Submit Payment Proof";
          showStatus(err?.message || "Unable to submit payment proof. Please try again.");
        }
      };
    });
  }

  async function startPayment(options = {}) {
    const serviceSlug = String(options.serviceSlug || "").trim();
    if (!serviceSlug) throw new Error("Payment service is not configured.");

    try {
      await ensureLogin();
      const order = await createOrder(serviceSlug, options.details || {}, options.toolRunId || null);
      return await startUpiProofPayment(order, options);
    } catch (error) {
      console.error("ILS payment error:", error);
      throw error;
    }
  }

  /*
    Public API
  */

  window.ILSPayments = {

    createOrder,

    startPayment,

    ensureLogin

  };

})();
