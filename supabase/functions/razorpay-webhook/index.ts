import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL") || "";
const role = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") || "";

async function hmac(keyText: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keyText),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(bytes)).map((v) => v.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!url || !role || !secret) return new Response("Not configured", { status: 503 });

  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") || "";
  const expected = await hmac(secret, raw);
  if (!safeEqual(expected, signature)) return new Response("Invalid signature", { status: 401 });

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const payment = event?.payload?.payment?.entity;
  if (!payment?.id || !payment?.order_id) return new Response("ok");
  const eventType = String(event?.event || "unknown");
  const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: row, error: lookupError } = await db
    .from("payments")
    .select("id,order_id,status,amount,currency,gateway_payment_id")
    .eq("gateway", "razorpay")
    .eq("gateway_order_id", payment.order_id)
    .maybeSingle();

  if (lookupError) return new Response("Payment lookup failed", { status: 500 });
  if (!row) return new Response("ok");

  if (eventType === "payment.captured" || eventType === "order.paid") {
    if (payment.status !== "captured") return new Response("Payment not captured", { status: 409 });
    if (Number(payment.amount) !== Math.round(Number(row.amount) * 100)
      || String(payment.currency || "").toUpperCase() !== String(row.currency || "").toUpperCase()) {
      return new Response("Gateway amount mismatch", { status: 409 });
    }
    if (row.gateway_payment_id && row.gateway_payment_id !== payment.id) {
      return new Response("Payment ID mismatch", { status: 409 });
    }

    const { data: finalized, error: finalizeError } = await db.rpc("ils_finalize_razorpay_payment", {
      p_payment_id: row.id,
      p_gateway_payment_id: payment.id,
      p_gateway_amount_minor: Number(payment.amount),
      p_gateway_currency: String(payment.currency || ""),
    });
    if (finalizeError || !finalized?.ok) return new Response("Payment finalization failed", { status: 409 });
  } else if (eventType === "payment.failed") {
    // Do not fail the order on a gateway failure event: webhook delivery can be out of order.
    if (row.status !== "paid" && !row.gateway_payment_id) {
      // A failed attempt is not the final payment ID for the Razorpay order:
      // customers may retry and a later captured event can carry a different ID.
      // Bind gateway_payment_id only after a captured payment is confirmed.
      const { error: paymentError } = await db.from("payments")
        .update({ status: "failed" })
        .eq("id", row.id)
        .in("status", ["created", "pending"])
        .is("gateway_payment_id", null);
      if (paymentError) return new Response("Payment update failed", { status: 500 });

    }
  }

  const { error: eventError } = await db.from("payment_events").insert({
    payment_id: row.id,
    event_type: eventType,
    payload: event,
  });
  if (eventError) return new Response("Event log failed", { status: 500 });
  return new Response("ok");
});
