import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logOrderCommunicationEvent } from "@/lib/order-communication-log";

type Body = {
  order_id: string;
};

const DOWNSTREAM_TIMEOUT_MS = 60_000;

export async function POST(request: Request) {
  let data: Body;
  try {
    data = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const orderId = typeof data.order_id === "string" ? data.order_id.trim() : "";
  if (!orderId) {
    return NextResponse.json({ error: "order_id required" }, { status: 400 });
  }

  console.log("[POST /api/whatsapp/send] WhatsApp message trigger", { orderId });

  try {
    const supabase = createServiceClient();

    const { data: order, error: oErr } = await supabase
      .from("orders")
      .select("id, phone, product_id")
      .eq("id", orderId)
      .maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!order) {
      console.error("[POST /api/whatsapp/send] Order not found", { orderId });
      return NextResponse.json({
        handled: true,
        sent: false,
        skipReason: "order_not_found",
      });
    }

    await logOrderCommunicationEvent(supabase, orderId, "whatsapp_triggered", null);

    const phone = (order.phone as string | null | undefined) ?? null;
    const productId = (order.product_id as string | null | undefined) ?? null;
    if (!phone || !productId) {
      const detail = !phone ? "missing_phone" : "missing_product_id";
      console.warn("[POST /api/whatsapp/send] Skipped —", detail, { orderId });
      await logOrderCommunicationEvent(supabase, orderId, "whatsapp_skipped", detail);
      return NextResponse.json({
        handled: true,
        sent: false,
        skipReason: detail,
      });
    }

    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("id, whatsapp_message_template")
      .eq("id", productId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!product) {
      console.warn("[POST /api/whatsapp/send] Skipped — product_not_found", { orderId, productId });
      await logOrderCommunicationEvent(supabase, orderId, "whatsapp_skipped", "product_not_found");
      return NextResponse.json({
        handled: true,
        sent: false,
        skipReason: "product_not_found",
      });
    }

    const template =
      (product.whatsapp_message_template as string | null | undefined) ?? null;
    const text = template?.trim() || "";
    if (!text) {
      console.warn("[POST /api/whatsapp/send] Skipped — no_whatsapp_template", { orderId, productId });
      await logOrderCommunicationEvent(
        supabase,
        orderId,
        "whatsapp_skipped",
        "no_whatsapp_template",
      );
      return NextResponse.json({
        handled: true,
        sent: false,
        skipReason: "no_whatsapp_template",
      });
    }

    const base = (process.env.WHATSAPP_SERVICE_URL || "").trim();
    if (!base) {
      console.warn("[POST /api/whatsapp/send] Skipped — WHATSAPP_SERVICE_URL not set");
      await logOrderCommunicationEvent(
        supabase,
        orderId,
        "whatsapp_skipped",
        "whatsapp_service_unconfigured",
      );
      return NextResponse.json({
        handled: true,
        sent: false,
        skipReason: "whatsapp_service_unconfigured",
      });
    }

    const url = `${base.replace(/\/$/, "")}/api/send-whatsapp`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), DOWNSTREAM_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message: text }),
        signal: ac.signal,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[POST /api/whatsapp/send] Downstream fetch failed", { orderId, msg });
      await logOrderCommunicationEvent(supabase, orderId, "whatsapp_failed", `fetch: ${msg}`);
      return NextResponse.json(
        { handled: false, sent: false, error: msg, retryable: true },
        { status: 503 },
      );
    } finally {
      clearTimeout(timer);
    }

    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      const errText = json.error || `WhatsApp service returned ${res.status}`;
      console.error("[POST /api/whatsapp/send] Downstream error", {
        orderId,
        status: res.status,
        errText,
      });
      await logOrderCommunicationEvent(
        supabase,
        orderId,
        "whatsapp_failed",
        `${res.status}: ${errText}`,
      );
      const retryable =
        res.status === 503 ||
        res.status === 502 ||
        res.status === 504 ||
        res.status >= 500;
      return NextResponse.json(
        { handled: false, sent: false, error: errText, retryable },
        { status: retryable ? 503 : res.status },
      );
    }

    console.log("[POST /api/whatsapp/send] Message sent successfully", { orderId });
    await logOrderCommunicationEvent(supabase, orderId, "whatsapp_sent", null);
    return NextResponse.json({ handled: true, sent: true });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[POST /api/whatsapp/send] Unexpected error", err);
    try {
      const supabase = createServiceClient();
      await logOrderCommunicationEvent(supabase, orderId, "whatsapp_failed", err.message);
    } catch {
      // ignore secondary log failures
    }
    return NextResponse.json({ error: err.message, handled: false, retryable: true }, { status: 500 });
  }
}
