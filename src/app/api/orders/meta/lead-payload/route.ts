import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { FORBIDDEN_RESPONSE, apiErrorResponse, apiValidationError } from "@/lib/api/errors";
import { resolveMetaProductDisplayName } from "@/lib/meta-product-custom-data";
import { resolveLeadEventId } from "@/lib/meta-lead-event-id";
import { resolveServerMetaPixelId } from "@/lib/meta-pixel-id";
import type { MetaPendingLeadPayload } from "@/lib/meta-lead-client";
import { verifyShopperOrderSuccessAccess } from "@/lib/orders/order-success-auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  order_id: z.string().uuid(),
  completion_token: z.string().uuid().optional(),
  action_token: z.string().min(1).optional(),
});

async function buildLeadPayload(orderId: string): Promise<NextResponse> {
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

    const eventId = resolveLeadEventId({
      orderId: order.id as string,
      metaEventId: order.meta_event_id as string | null,
    });
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
    pixelId: resolveServerMetaPixelId(),
    phone: (order.phone as string | null) ?? undefined,
    customerName: (order.customer_name as string | null) ?? undefined,
  };

  return NextResponse.json({ payload, meta_lead_sent: false });
}

/**
 * Reconstructs browser Lead params from the order row when sessionStorage
 * pending payload is missing (refresh, StrictMode, new tab).
 */
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiValidationError("Invalid JSON");
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiValidationError("order_id required");
  }

  const orderId = parsed.data.order_id.trim();
  const access = await verifyShopperOrderSuccessAccess({
    orderId,
    completionToken: parsed.data.completion_token,
    actionToken: parsed.data.action_token,
  });
  if (!access.ok) return FORBIDDEN_RESPONSE;

  try {
    return await buildLeadPayload(orderId);
  } catch (e) {
    return apiErrorResponse(e, "[POST /api/orders/meta/lead-payload]");
  }
}

/** @deprecated Prefer POST with action tokens — GET relies on HttpOnly cookies only. */
export async function GET(request: Request) {
  const orderId = new URL(request.url).searchParams.get("order_id")?.trim();
  if (!orderId) return apiValidationError("order_id required");

  const access = await verifyShopperOrderSuccessAccess({ orderId });
  if (!access.ok) return FORBIDDEN_RESPONSE;

  try {
    return await buildLeadPayload(orderId);
  } catch (e) {
    return apiErrorResponse(e, "[GET /api/orders/meta/lead-payload]");
  }
}
