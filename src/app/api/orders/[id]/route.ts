import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { OrderStatus } from "@/types";
import {
  META_PURCHASE_TRACKING_CURRENCY,
  META_PURCHASE_TRACKING_VALUE,
} from "@/lib/meta-purchase-tracking";
import { createMetaEventId, resolveClientIpAddress, sendMetaEvent } from "@/utils/meta";

type Body = {
  status?: OrderStatus;
};

const ORDER_STATUSES: OrderStatus[] = ["pending", "confirmed", "shipped", "cancelled"];

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") throw new Error("Forbidden");
}

type MetaClientContext = {
  clientIpAddress: string | null;
  clientUserAgent: string | null;
};

function resolveFallbackPixelId(): string | null {
  return process.env.META_PIXEL_ID?.trim() || process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || null;
}

/** Returned on PATCH when status becomes `confirmed` so the admin UI can confirm CAPI delivery. */
type MetaPurchaseCapiPayload =
  | { state: "sent" }
  | { state: "skipped"; reason: "already_sent" | "missing_order_meta" }
  | {
      state: "failed";
      reason:
        | "missing_access_token"
        | "missing_pixel_id"
        | "http_error"
        | "network_error"
        | "rejected";
    };

async function processMetaByStatus(
  orderId: string,
  client: MetaClientContext,
  request: Request,
): Promise<{ purchase?: MetaPurchaseCapiPayload }> {
  const supabase = createServiceClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, status, customer_name, phone, total_price, currency, meta_event_id, meta_event_source_url, meta_pixel_id, meta_purchase_sent, meta_cancel_sent",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) return {};

  if (order.status === "confirmed" && !order.meta_purchase_sent) {
    let eventId = order.meta_event_id?.trim() || "";
    const pixelId = order.meta_pixel_id?.trim() || resolveFallbackPixelId() || "";

    if (!eventId) {
      eventId = createMetaEventId();
      await supabase.from("orders").update({ meta_event_id: eventId }).eq("id", order.id);
    }
    if (!order.meta_pixel_id && pixelId) {
      await supabase.from("orders").update({ meta_pixel_id: pixelId }).eq("id", order.id);
    }

    if (!eventId || !pixelId) {
      console.warn("[meta] Purchase CAPI skipped: order missing meta_event_id or meta_pixel_id", {
        orderId,
      });
      return { purchase: { state: "skipped", reason: "missing_order_meta" } };
    }
    const capi = await sendMetaEvent({
      pixelId,
      eventName: "Purchase",
      eventId,
      eventSourceUrl: order.meta_event_source_url,
      requestHeaders: request.headers,
      userData: {
        name: order.customer_name,
        phone: order.phone,
        clientIpAddress: client.clientIpAddress,
        clientUserAgent: client.clientUserAgent,
      },
      customData: {
        value: META_PURCHASE_TRACKING_VALUE,
        currency: META_PURCHASE_TRACKING_CURRENCY,
      },
    });
    if (capi.ok) {
      await supabase
        .from("orders")
        .update({ meta_purchase_sent: true })
        .eq("id", order.id)
        .eq("meta_purchase_sent", false);
      return { purchase: { state: "sent" } };
    }
    return { purchase: { state: "failed", reason: capi.reason } };
  }

  if (order.status === "confirmed" && order.meta_purchase_sent) {
    return { purchase: { state: "skipped", reason: "already_sent" } };
  }

  if (order.status === "cancelled" && !order.meta_cancel_sent) {
    const eventId = order.meta_event_id?.trim() || createMetaEventId();
    const pixelId = order.meta_pixel_id?.trim() || resolveFallbackPixelId();
    if (!order.meta_event_id) {
      await supabase.from("orders").update({ meta_event_id: eventId }).eq("id", order.id);
    }
    if (!order.meta_pixel_id && pixelId) {
      await supabase.from("orders").update({ meta_pixel_id: pixelId }).eq("id", order.id);
    }
    if (!pixelId) return {};
    const capi = await sendMetaEvent({
      pixelId,
      eventName: "CancelledLead",
      eventId,
      eventSourceUrl: order.meta_event_source_url,
      requestHeaders: request.headers,
      userData: {
        name: order.customer_name,
        phone: order.phone,
        clientIpAddress: client.clientIpAddress,
        clientUserAgent: client.clientUserAgent,
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
  }

  return {};
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await assertAdmin();
    const { id } = await context.params;
    const orderId = id?.trim();
    if (!orderId) {
      return NextResponse.json({ error: "Order id required" }, { status: 400 });
    }

    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const updatePatch: Record<string, unknown> = {};
    if (typeof body.status === "string") {
      if (!ORDER_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updatePatch.status = body.status;
    }

    if (Object.keys(updatePatch).length === 0) {
      return NextResponse.json({ error: "No changes provided" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: updated, error: updateError } = await supabase
      .from("orders")
      .update(updatePatch)
      .eq("id", orderId)
      .select("id, status")
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (!updated) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const clientIpAddress = resolveClientIpAddress(request.headers);
    const clientUserAgent = request.headers.get("user-agent");

    let meta: { purchase?: MetaPurchaseCapiPayload } = {};
    try {
      meta = await processMetaByStatus(orderId, { clientIpAddress, clientUserAgent }, request);
    } catch (error) {
      console.error("[PATCH /api/orders/[id]] Meta processing failed", {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const responsePayload: {
      success: true;
      order: typeof updated;
      meta?: { purchase?: MetaPurchaseCapiPayload };
    } = { success: true, order: updated };
    if (updated.status === "confirmed" && meta.purchase) {
      responsePayload.meta = { purchase: meta.purchase };
    }

    return NextResponse.json(responsePayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
