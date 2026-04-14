import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logOrderCommunicationEvent } from "@/lib/order-communication-log";
import { resolveClientIpAddress, sendMetaEvent } from "@/utils/meta";

type Body = {
  product_id: string;
  customer_name: string;
  phone: string;
  address?: string;
  meta_event_id?: string;
  event_source_url?: string;
};

export async function POST(request: Request) {
  let data: Body;
  try {
    data = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (!data.product_id || typeof data.product_id !== "string") {
      return NextResponse.json({ error: "product_id required" }, { status: 400 });
    }
    if (!data.customer_name || typeof data.customer_name !== "string" || !data.customer_name.trim()) {
      return NextResponse.json({ error: "customer_name required" }, { status: 400 });
    }
    if (!data.phone || typeof data.phone !== "string" || !data.phone.trim()) {
      return NextResponse.json({ error: "phone required" }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("id, discount_price, price, meta_pixel_id")
      .eq("id", data.product_id)
      .maybeSingle();

    if (pErr) {
      throw new Error(pErr.message);
    }
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const total =
      product.discount_price != null
        ? Number(product.discount_price)
        : Number(product.price);

    const orderEventId =
      typeof data.meta_event_id === "string" && data.meta_event_id.trim()
        ? data.meta_event_id.trim()
        : null;
    const eventSourceUrl =
      typeof data.event_source_url === "string" && data.event_source_url.trim()
        ? data.event_source_url.trim()
        : null;

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        product_id: data.product_id,
        customer_name: data.customer_name.trim(),
        phone: data.phone.trim(),
        address: data.address?.trim() || null,
        payment_method: null,
        payment_number: null,
        transaction_reference: null,
        receipt_image_url: null,
        total_price: total,
        currency: "MRU",
        status: "pending",
        meta_event_id: orderEventId,
        meta_event_source_url: eventSourceUrl,
        meta_pixel_id: product.meta_pixel_id ?? null,
      })
      .select("id, total_price, meta_event_id, meta_event_source_url, meta_pixel_id")
      .single();

    if (orderErr) {
      throw new Error(orderErr.message);
    }
    if (!order) {
      throw new Error("Create failed: no order returned");
    }

    console.log("[POST /api/orders] Order created", {
      order_id: order.id,
      product_id: data.product_id,
      phone: data.phone.trim(),
    });

    await logOrderCommunicationEvent(supabase, order.id, "order_created", null);

    try {
      const clientIpAddress = resolveClientIpAddress(request.headers);
      const clientUserAgent = request.headers.get("user-agent");

      let leadSent = false;
      if (order.meta_event_id) {
        const leadCapi = await sendMetaEvent({
          pixelId: order.meta_pixel_id,
          eventName: "Lead",
          eventId: order.meta_event_id,
          eventSourceUrl: order.meta_event_source_url,
          requestHeaders: request.headers,
          userData: {
            name: data.customer_name,
            phone: data.phone,
            clientIpAddress,
            clientUserAgent,
          },
          customData: {
            value: Number(order.total_price),
            currency: "MRU",
          },
        });
        leadSent = leadCapi.ok;
      }

      if (leadSent) {
        await supabase
          .from("orders")
          .update({ meta_lead_sent: true })
          .eq("id", order.id)
          .eq("meta_lead_sent", false);
      }
    } catch (error) {
      console.error("[POST /api/orders] Lead CAPI send skipped", {
        order_id: order.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return NextResponse.json({
      success: true,
      order_id: order.id,
      total_price: order.total_price,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[POST /api/orders]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
