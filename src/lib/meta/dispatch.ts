import type { SupabaseClient } from "@supabase/supabase-js";
import { metaPurchaseMoneyFromOrderTotal } from "@/lib/meta-purchase-tracking";
import { resolveServerMetaPixelId } from "@/lib/meta-pixel-id";
import { createMetaEventId, resolveClientIpAddress, sendMetaEvent } from "@/utils/meta";

export type MetaDispatchEventType = "lead" | "purchase" | "cancel";

export type MetaDispatchResult =
  | { sent: true; skipped?: false }
  | { sent: false; skipped: true; reason: string }
  | { sent: false; skipped?: false; reason: string };

type MetaSentFlagColumn = "meta_lead_sent" | "meta_purchase_sent" | "meta_cancel_sent";

function sentFlagColumn(eventType: MetaDispatchEventType): MetaSentFlagColumn {
  if (eventType === "lead") return "meta_lead_sent";
  if (eventType === "purchase") return "meta_purchase_sent";
  return "meta_cancel_sent";
}

/** Claim exactly-once dispatch slot in DB before calling Meta. */
async function claimMetaDispatch(
  supabase: SupabaseClient,
  orderId: string,
  eventType: MetaDispatchEventType,
): Promise<boolean> {
  const { error } = await supabase.from("order_meta_dispatches").insert({
    order_id: orderId,
    event_type: eventType,
  });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(error.message);
}

async function releaseMetaDispatchClaim(
  supabase: SupabaseClient,
  orderId: string,
  eventType: MetaDispatchEventType,
): Promise<void> {
  await supabase
    .from("order_meta_dispatches")
    .delete()
    .eq("order_id", orderId)
    .eq("event_type", eventType);
}

type MetaClientContext = {
  requestHeaders?: Headers;
};

/**
 * Single-path Meta CAPI dispatcher with idempotency ledger.
 * Callers must enforce order status preconditions before invoking.
 */
export async function dispatchMetaEvent(
  supabase: SupabaseClient,
  orderId: string,
  eventType: MetaDispatchEventType,
  context: MetaClientContext = {},
): Promise<MetaDispatchResult> {
  const flagColumn = sentFlagColumn(eventType);

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, product_id, status, customer_name, phone, total_price, currency, meta_event_id, meta_event_source_url, meta_pixel_id, meta_fbp, meta_fbc, meta_lead_sent, meta_purchase_sent, meta_cancel_sent",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!order) return { sent: false, skipped: true, reason: "order_not_found" };

  if (order[flagColumn] === true) {
    return { sent: false, skipped: true, reason: "already_sent" };
  }

  if (eventType === "purchase" && order.status !== "confirmed") {
    return { sent: false, skipped: true, reason: "status_not_confirmed" };
  }
  if (eventType === "cancel" && order.status !== "cancelled") {
    return { sent: false, skipped: true, reason: "status_not_cancelled" };
  }

  const claimed = await claimMetaDispatch(supabase, orderId, eventType);
  if (!claimed) {
    return { sent: false, skipped: true, reason: "already_sent" };
  }

  let eventId = (order.meta_event_id as string | null)?.trim() || "";
  let pixelId = resolveServerMetaPixelId(order.meta_pixel_id as string | null) || "";

  if (!pixelId && order.product_id) {
    const { data: product } = await supabase
      .from("products")
      .select("meta_pixel_id")
      .eq("id", order.product_id as string)
      .maybeSingle();
    pixelId = resolveServerMetaPixelId(product?.meta_pixel_id as string | null) || "";
  }

  console.info("[meta] CAPI dispatch attempt", {
    orderId,
    eventType,
    hasPixelId: Boolean(pixelId),
    tokenConfigured: Boolean(process.env.META_CAPI_ACCESS_TOKEN?.trim()),
  });

  if (!eventId) {
    eventId = createMetaEventId();
    await supabase.from("orders").update({ meta_event_id: eventId }).eq("id", order.id);
  }
  if (!(order.meta_pixel_id as string | null)?.trim() && pixelId) {
    await supabase.from("orders").update({ meta_pixel_id: pixelId }).eq("id", order.id);
  }
  if (!pixelId) {
    await releaseMetaDispatchClaim(supabase, orderId, eventType);
    console.warn("[meta] CAPI skipped: no pixel id on order/product", {
      orderId,
      eventType,
    });
    return { sent: false, skipped: true, reason: "missing_meta_data" };
  }

  const headers = context.requestHeaders ?? new Headers();
  const eventName =
    eventType === "lead" ? "Lead" : eventType === "purchase" ? "Purchase" : "CancelledLead";

  const orderMoney = metaPurchaseMoneyFromOrderTotal(
    Number(order.total_price),
    (order.currency as string) ?? "MRU",
  );
  const customData =
    eventType === "cancel"
      ? { value: 0, currency: "MRU", status: "cancelled" }
      : orderMoney;

  try {
    const capi = await sendMetaEvent({
      pixelId,
      eventName,
      eventId,
      eventSourceUrl: order.meta_event_source_url as string | null,
      requestHeaders: headers,
      userData: {
        name: order.customer_name as string | null,
        phone: order.phone as string | null,
        fbp: order.meta_fbp as string | null,
        fbc: order.meta_fbc as string | null,
        clientIpAddress: resolveClientIpAddress(headers),
        clientUserAgent: headers.get("user-agent"),
      },
      customData,
    });

    if (!capi.ok) {
      await releaseMetaDispatchClaim(supabase, orderId, eventType);
      console.warn("[meta] CAPI dispatch failed", {
        orderId,
        eventType,
        pixelIdPrefix: pixelId.slice(0, 6),
        reason: capi.reason,
      });
      return { sent: false, reason: capi.reason ?? "capi_failed" };
    }

    const { data: marked, error: markErr } = await supabase
      .from("orders")
      .update({ [flagColumn]: true })
      .eq("id", order.id)
      .eq(flagColumn, false)
      .select("id")
      .maybeSingle();

    if (markErr) throw new Error(markErr.message);
    if (!marked) {
      await releaseMetaDispatchClaim(supabase, orderId, eventType);
      return { sent: false, skipped: true, reason: "already_sent" };
    }

    return { sent: true };
  } catch (e) {
    await releaseMetaDispatchClaim(supabase, orderId, eventType);
    throw e;
  }
}
