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
      if (typeof supabaseClient !== "undefined") {
        return supabaseClient;
      }
    } catch (e) {}

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

  async function startPayment(options = {}) {

    const serviceSlug =
      String(options.serviceSlug || "").trim();

    if (!serviceSlug) {
      throw new Error(
        "Payment service is not configured."
      );
    }

    try {

      await ensureLogin();

      await loadRazorpayScript();

      /*
        STEP 1:
        Create ILS order through existing RPC.
      */

      const order =
        await createOrder(
          serviceSlug,
          options.details || {},
          options.toolRunId || null
        );

      /*
        STEP 2:
        Create Razorpay order through
        existing protected Edge Function.
      */

      const payment =
        await callPaymentFunction({
          action: "create",
          order_id: order.order_id
        });

      if (!payment.razorpay_order_id) {
        throw new Error(
          "Razorpay order was not created."
        );
      }

      /*
        STEP 3:
        Open Razorpay checkout.
      */

      return await new Promise(
        (resolve, reject) => {

          let finished = false;

          const finishReject = error => {
            if (finished) return;
            finished = true;
            reject(error);
          };

          const finishResolve = result => {
            if (finished) return;
            finished = true;
            resolve(result);
          };

          const razorpay =
            new Razorpay({

              key:
                payment.key_id,

              amount:
                Math.round(
                  Number(payment.amount) * 100
                ),

              currency:
                payment.currency || "INR",

              name:
                "Instant Legal Services",

              description:
                options.description ||
                order.service_name ||
                "Legal Service",

              order_id:
                payment.razorpay_order_id,

              prefill:
                options.prefill || {},

              notes: {
                ils_order_id:
                  order.order_id
              },

              theme: {
                color: "#d4a72c"
              },

              handler:
                async function (response) {

                  try {

                    /*
                      STEP 4:
                      Verify signature on server.
                    */

                    const verified =
                      await callPaymentFunction({
                        action: "verify",
                        order_id:
                          order.order_id,
                        razorpay_payment_id:
                          response.razorpay_payment_id,
                        razorpay_signature:
                          response.razorpay_signature
                      });

                    finishResolve({
                      ok: true,
                      status:
                        verified.status ||
                        "paid",
                      order_id:
                        order.order_id,
                      order_number:
                        verified.order_number ||
                        order.order_number,
                      payment_id:
                        response.razorpay_payment_id
                    });

                  } catch (error) {

                    console.error(
                      "Payment verification failed:",
                      error
                    );

                    finishReject(error);
                  }
                },

              modal: {
                ondismiss:
                  function () {
                    finishReject(
                      new Error(
                        "Payment cancelled."
                      )
                    );
                  }
              }
            });

          razorpay.on(
            "payment.failed",
            function (response) {

              console.error(
                "Razorpay payment failed:",
                response
              );

              finishReject(
                new Error(
                  response?.error?.description ||
                  "Payment failed."
                )
              );
            }
          );

          razorpay.open();
        }
      );

    } catch (error) {

      console.error(
        "ILS payment error:",
        error
      );

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
