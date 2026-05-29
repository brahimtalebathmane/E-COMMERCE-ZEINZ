import type { SupabaseClient } from "@supabase/supabase-js";
import { metaPurchaseMoneyFromOrderTotal } from "@/lib/meta-purchase-tracking";
import { createMetaEventId, resolveClientIpAddress, sendMetaEvent } from "@/utils/meta";

export type MetaDispatchEventType = "lead" | "purchase" | "cancel";

export type MetaDispatchResult =
  | { sent: true; skipped?: false }
  | { sent: false; skipped: true; reason: string }
  | { sent: false; skipped?: false; reason: string };

function resolveFallbackPixelId(): string | null {
  return process.env.META_PIXEL_ID?.trim() || process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || null;
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
  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, status, customer_name, phone, total_price, currency, meta_event_id, meta_event_source_url, meta_pixel_id, meta_fbp, meta_fbc",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!order) return { sent: false, skipped: true, reason: "order_not_found" };

  if (eventType === "purchase" && order.status !== "confirmed") {
    return { sent: false, skipped: true, reason: "status_not_confirmed" };
  }
  if (eventType === "cancel" && order.status !== "cancelled") {
    return { sent: false, skipped: true, reason: "status_not_cancelled" };
  }

  const claimed = await claimMetaDispatch(supabase, orderId, eventType);
  if (!claimed) {
    return { sent: false, skipped: true, reason: "already_dispatched" };
  }

  let eventId = (order.meta_event_id as string | null)?.trim() || "";
  const pixelId =
    (order.meta_pixel_id as string | null)?.trim() || resolveFallbackPixelId() || "";

  if (!eventId) {
    eventId = createMetaEventId();
    await supabase.from("orders").update({ meta_event_id: eventId }).eq("id", order.id);
  }
  if (!(order.meta_pixel_id as string | null)?.trim() && pixelId) {
    await supabase.from("orders").update({ meta_pixel_id: pixelId }).eq("id", order.id);
  }
  if (!pixelId) {
    await releaseMetaDispatchClaim(supabase, orderId, eventType);
    return { sent: false, skipped: true, reason: "missing_meta_data" };
  }

  const headers = context.requestHeaders ?? new Headers();
  const eventName =
    eventType === "lead" ? "Lead" : eventType === "purchase" ? "Purchase" : "CancelledLead";

  const customData =
    eventType === "cancel"
      ? { value: 0, currency: "MRU", status: "cancelled" }
      : eventType === "lead"
        ? {
            value: Number(order.total_price),
            currency: (order.currency as string) ?? "MRU",
          }
        : metaPurchaseMoneyFromOrderTotal(
            Number(order.total_price),
            (order.currency as string) ?? "MRU",
          );

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
      return { sent: false, reason: capi.reason ?? "capi_failed" };
    }

    const flagColumn =
      eventType === "lead"
        ? "meta_lead_sent"
        : eventType === "purchase"
          ? "meta_purchase_sent"
          : "meta_cancel_sent";

    await supabase
      .from("orders")
      .update({ [flagColumn]: true })
      .eq("id", order.id);

    return { sent: true };
  } catch (e) {
    await releaseMetaDispatchClaim(supabase, orderId, eventType);
    throw e;
  }
}
