import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveClientIpAddress, sendMetaEvent } from "@/utils/meta";

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

  if (!data.order_id || typeof data.order_id !== "string") {
    return NextResponse.json({ error: "order_id required" }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    const { data: order, error } = await supabase
      .from("orders")
      .select(
        "id, status, customer_name, phone, meta_event_id, meta_event_source_url, meta_pixel_id, meta_cancel_sent",
      )
      .eq("id", data.order_id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (order.status !== "cancelled") {
      return NextResponse.json({ sent: false, reason: "status_not_cancelled" }, { status: 200 });
    }
    if (order.meta_cancel_sent) {
      return NextResponse.json({ sent: false, reason: "already_sent" }, { status: 200 });
    }
    if (!order.meta_event_id || !order.meta_pixel_id) {
      return NextResponse.json({ sent: false, reason: "missing_meta_data" }, { status: 200 });
    }

    const capi = await sendMetaEvent({
      pixelId: order.meta_pixel_id,
      eventName: "CancelledLead",
      eventId: order.meta_event_id,
      eventSourceUrl: order.meta_event_source_url,
      requestHeaders: request.headers,
      userData: {
        name: order.customer_name,
        phone: order.phone,
        clientIpAddress: resolveClientIpAddress(request.headers),
        clientUserAgent: request.headers.get("user-agent"),
      },
      customData: {
        value: 0,
        currency: "MRU",
        status: "cancelled",
      },
    });

    if (capi.ok) {
      await supabase
        .from("orders")
        .update({ meta_cancel_sent: true })
        .eq("id", order.id)
        .eq("meta_cancel_sent", false);
    }
    return NextResponse.json({ sent: capi.ok });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[POST /api/meta/cancel]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
