import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { FORBIDDEN_RESPONSE, apiErrorResponse, apiValidationError } from "@/lib/api/errors";
import { resolveMetaProductDisplayName } from "@/lib/meta-product-custom-data";
import { buildMetaLeadEventId } from "@/lib/meta-lead-event-id";
import { resolveServerMetaPixelId } from "@/lib/meta-pixel-id";
import type { MetaPendingLeadPayload } from "@/lib/meta-lead-client";
import { readVerifiedOrderSuccessSession } from "@/lib/orders/order-success-session";

export const dynamic = "force-dynamic";

/**
 * Reconstructs browser Lead params from the order row when sessionStorage
 * pending payload is missing (refresh, StrictMode, new tab).
 */
export async function GET(request: Request) {
  const orderId = new URL(request.url).searchParams.get("order_id")?.trim();
  if (!orderId) return apiValidationError("order_id required");

  const session = await readVerifiedOrderSuccessSession(orderId);
  if (!session.ok) return FORBIDDEN_RESPONSE;

  try {
    const supabase = createServiceClient();
    const { data: order, error } = await supabase
      .from("orders")
      .select(
        "id, product_id, customer_name, phone, total_price, currency, meta_event_id, meta_pixel_id, meta_lead_sent",
      )
      .eq("id", orderId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!order) {
      return NextResponse.json({ payload: null, meta_lead_sent: false, reason: "order_not_found" });
    }

    if (order.meta_lead_sent === true) {
      return NextResponse.json({ payload: null, meta_lead_sent: true });
    }

    const eventId = buildMetaLeadEventId(order.id as string);
    if (!order.product_id) {
      return NextResponse.json({ payload: null, meta_lead_sent: false, reason: "missing_meta_data" });
    }

    let productName = "Product";
    const { data: product } = await supabase
      .from("products")
      .select("name_ar, name_fr, default_language")
      .eq("id", order.product_id as string)
      .maybeSingle();
    if (product) {
      productName = resolveMetaProductDisplayName(product);
    }

    const payload: MetaPendingLeadPayload = {
      value: Number(order.total_price),
      currency: (order.currency as string) ?? "MRU",
      eventId,
      orderId: order.id as string,
      productId: order.product_id as string,
      productName,
      pixelId: resolveServerMetaPixelId(order.meta_pixel_id as string | null),
      phone: (order.phone as string | null) ?? undefined,
      customerName: (order.customer_name as string | null) ?? undefined,
    };

    return NextResponse.json({ payload, meta_lead_sent: false });
  } catch (e) {
    return apiErrorResponse(e, "[GET /api/orders/meta/lead-payload]");
  }
}
