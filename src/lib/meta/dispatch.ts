import type { SupabaseClient } from "@supabase/supabase-js";
import { metaPurchaseMoneyFromOrderTotal } from "@/lib/meta-purchase-tracking";
import { resolveServerMetaPixelId } from "@/lib/meta-pixel-id";
import {
  buildMetaOrderValueCustomData,
  buildMetaProductCustomData,
  resolveMetaProductDisplayName,
} from "@/lib/meta-product-custom-data";
import { resolveClientIpAddress, sendMetaEvent } from "@/utils/meta";

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

/**
 * Deterministic, per-event-type `event_id` tied to the immutable order id.
 *
 * `Purchase` and `CancelledLead` are server-only (no paired browser pixel).
 * `Lead` is hybrid (browser pixel + CAPI): the client generates the canonical
 * id before submit and stores it on `orders.meta_event_id`; CAPI reuses it
 * verbatim so Meta dedupes on `(event_name, event_id)`. When that field is
 * empty (legacy rows / edge cases), fall back to `lead_{orderId}`.
 */
function transactionalEventId(
  orderId: string,
  eventType: Exclude<MetaDispatchEventType, "lead">,
): string {
  if (eventType === "purchase") return `purchase_${orderId}`;
  return `cancelledlead_${orderId}`;
}

function resolveLeadEventId(orderId: string, clientEventId: string | null | undefined): string {
  const fromClient = clientEventId?.trim();
  if (fromClient) return fromClient;
  return `lead_${orderId}`;
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
  /** Fallback only when order has no stored shopper IP (legacy rows). */
  requestHeaders?: Headers;
};

function orderCustomerSessionContext(
  order: Record<string, unknown>,
  requestHeaders?: Headers,
): {
  clientIpAddress: string | null;
  clientUserAgent: string | null;
  fbp: string | null;
  fbc: string | null;
  source?: "request_fallback";
} {
  const storedIp = (order.meta_client_ip_address as string | null)?.trim() || null;
  const storedUa = (order.meta_client_user_agent as string | null)?.trim() || null;
  const fbp = (order.meta_fbp as string | null)?.trim() || null;
  const fbc = (order.meta_fbc as string | null)?.trim() || null;

  let clientIpAddress = storedIp;
  let clientUserAgent = storedUa;
  let source: "request_fallback" | undefined;

  if (requestHeaders && (!clientIpAddress || !clientUserAgent)) {
    if (!clientIpAddress) {
      clientIpAddress = resolveClientIpAddress(requestHeaders);
    }
    if (!clientUserAgent) {
      clientUserAgent = requestHeaders.get("user-agent")?.trim() || null;
    }
    if (
      (clientIpAddress && clientIpAddress !== storedIp) ||
      (clientUserAgent && clientUserAgent !== storedUa)
    ) {
      source = "request_fallback";
    }
  }

  return {
    clientIpAddress,
    clientUserAgent,
    fbp,
    fbc,
    source,
  };
}

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
      "id, product_id, status, customer_name, phone, total_price, currency, meta_event_id, meta_event_source_url, meta_pixel_id, meta_fbp, meta_fbc, meta_client_ip_address, meta_client_user_agent, meta_lead_sent, meta_purchase_sent, meta_cancel_sent",
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

  const eventId =
    eventType === "lead"
      ? resolveLeadEventId(orderId, order.meta_event_id as string | null)
      : transactionalEventId(orderId, eventType);
  let pixelId = resolveServerMetaPixelId(order.meta_pixel_id as string | null) || "";
  let productCustomData: ReturnType<typeof buildMetaProductCustomData>;

  if (order.product_id) {
    const { data: product } = await supabase
      .from("products")
      .select("meta_pixel_id, name_ar, name_fr, default_language")
      .eq("id", order.product_id as string)
      .maybeSingle();

    if (product) {
      if (!pixelId) {
        pixelId = resolveServerMetaPixelId(product.meta_pixel_id as string | null) || "";
      }
      productCustomData = buildMetaProductCustomData({
        productId: order.product_id as string,
        productName: resolveMetaProductDisplayName({
          name_ar: product.name_ar as string | null,
          name_fr: product.name_fr as string | null,
          default_language: product.default_language as "ar" | "fr" | null,
        }),
      });
    } else {
      productCustomData = buildMetaProductCustomData({
        productId: order.product_id as string,
        productName: "Product",
      });
    }
  }

  console.warn("[meta] CAPI dispatch attempt", {
    orderId,
    eventType,
    hasPixelId: Boolean(pixelId),
    tokenConfigured: Boolean(process.env.META_CAPI_ACCESS_TOKEN?.trim()),
  });

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
    eventType === "purchase" || eventType === "lead" || eventType === "cancel"
      ? order.product_id
        ? buildMetaOrderValueCustomData({
            ...orderMoney,
            productId: order.product_id as string,
            productName: productCustomData?.content_name ?? "Product",
          })
        : orderMoney
      : productCustomData;

  const session = orderCustomerSessionContext(order, headers);
  if (session.source === "request_fallback") {
    console.warn("[meta] CAPI session context from request headers", {
      orderId,
      eventType,
      source: session.source,
      hasIp: Boolean(session.clientIpAddress),
      hasUserAgent: Boolean(session.clientUserAgent),
    });
  }

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
        fbp: session.fbp,
        fbc: session.fbc,
        clientIpAddress: session.clientIpAddress,
        clientUserAgent: session.clientUserAgent,
        externalId: order.id as string,
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
