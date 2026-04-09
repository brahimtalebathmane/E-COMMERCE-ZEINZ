import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

type Body = {
  order_id: string;
};

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

  try {
    const supabase = createServiceClient();

    const { data: order, error: oErr } = await supabase
      .from("orders")
      .select("id, phone, product_id")
      .eq("id", orderId)
      .maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const phone = (order.phone as string | null | undefined) ?? null;
    const productId = (order.product_id as string | null | undefined) ?? null;
    if (!phone || !productId) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("id, whatsapp_message_template")
      .eq("id", productId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!product) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const template =
      (product.whatsapp_message_template as string | null | undefined) ?? null;
    const text = template?.trim() || "";
    if (!text) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const base = (process.env.WHATSAPP_SERVICE_URL || "").trim();
    if (!base) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "whatsapp_service_unconfigured",
      });
    }

    const res = await fetch(`${base.replace(/\/$/, "")}/api/send-whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message: text }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      return NextResponse.json(
        { error: json.error || `WhatsApp service returned ${res.status}` },
        { status: res.status },
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[POST /api/whatsapp/send]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

