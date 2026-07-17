import type { SupabaseClient } from "@supabase/supabase-js";
import { metaPurchaseMoneyFromOrderTotal } from "@/lib/meta-purchase-tracking";
import { resolveServerMetaPixelId } from "@/lib/meta-pixel-id";
import {
  buildMetaOrderValueCustomData,
  buildMetaProductCustomData,
  resolveMetaProductDisplayName,
} from "@/lib/meta-product-custom-data";
import { resolveLeadEventId } from "@/lib/meta-lead-event-id";
import {
  logMetaEventOutcomeFireAndForget,
  mapDispatchEventTypeToLog,
} from "@/lib/meta/event-log";
import { buildPublicProductUrl } from "@/lib/site-url";
import { sendMetaEvent } from "@/utils/meta";

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
 * `Lead` is hybrid: browser Pixel + CAPI share `lead_{orderId}` (never the
 * InitiateCheckout funnel session id stored in `orders.meta_event_id`).
 */
function transactionalEventId(
  orderId: string,
  eventType: Exclude<MetaDispatchEventType, "lead">,
): string {
  if (eventType === "purchase") return `purchase_${orderId}`;
  return `cancelledlead_${orderId}`;
}

function resolveLeadEventIdForOrder(order: Record<string, unknown>): string {
  return resolveLeadEventId({
    orderId: order.id as string,
    metaEventId: order.meta_event_id as string | null,
  });
}

function resolveLogEventId(
  orderId: string,
  eventType: MetaDispatchEventType,
  order?: Record<string, unknown>,
): string {
  if (eventType === "lead" && order) {
    return resolveLeadEventIdForOrder(order);
  }
  if (eventType === "lead") {
    return resolveLeadEventId({ orderId, metaEventId: null });
  }
  return transactionalEventId(orderId, eventType);
}

function recordDispatchOutcome(
  supabase: SupabaseClient,
  params: {
    orderId: string;
    productId?: string | null;
    eventType: MetaDispatchEventType;
    eventId: string;
    result: MetaDispatchResult;
    detail?: string | null;
  },
): void {
  const logType = mapDispatchEventTypeToLog(params.eventType);
  if (params.result.sent) {
    logMetaEventOutcomeFireAndForget({
      supabase,
      eventType: logType,
      eventId: params.eventId,
      orderId: params.orderId,
      productId: params.productId ?? null,
      state: "success",
      detail: params.detail,
    });
    return;
  }
  if (params.result.skipped) {
    logMetaEventOutcomeFireAndForget({
      supabase,
      eventType: logType,
      eventId: params.eventId,
      orderId: params.orderId,
      productId: params.productId ?? null,
      state: "skipped",
      reason: params.result.reason,
      detail: params.detail,
      notifyOnFailure: false,
    });
    return;
  }
  logMetaEventOutcomeFireAndForget({
    supabase,
    eventType: logType,
    eventId: params.eventId,
    orderId: params.orderId,
    productId: params.productId ?? null,
    state: "failed",
    reason: params.result.reason,
    detail: params.detail,
  });
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
  /** Used only for `event_source_url` resolution when the stored URL is missing. */
  requestHeaders?: Headers;
  /** Unix seconds from the browser — pairs CAPI `event_time` with Pixel Lead. */
  eventTimeSec?: number;
};

/** Shopper session fields captured at order creation — never substituted from admin retries. */
function orderCustomerSessionContext(order: Record<string, unknown>): {
  clientIpAddress: string | null;
  clientUserAgent: string | null;
  fbp: string | null;
  fbc: string | null;
  missingStoredSession: boolean;
} {
  const clientIpAddress =
    (order.meta_client_ip_address as string | null)?.trim() || null;
  const clientUserAgent =
    (order.meta_client_user_agent as string | null)?.trim() || null;
  const fbp = (order.meta_fbp as string | null)?.trim() || null;
  const fbc = (order.meta_fbc as string | null)?.trim() || null;

  return {
    clientIpAddress,
    clientUserAgent,
    fbp,
    fbc,
    missingStoredSession: !clientIpAddress || !clientUserAgent,
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
      "id, product_id, status, customer_name, phone, total_price, currency, quantity, meta_event_id, meta_event_source_url, meta_fbp, meta_fbc, meta_client_ip_address, meta_client_user_agent, meta_lead_sent, meta_purchase_sent, meta_cancel_sent, deleted_at",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!order || order.deleted_at != null) {
    const result = { sent: false, skipped: true, reason: "order_not_found" } as const;
    recordDispatchOutcome(supabase, {
      orderId,
      eventType,
      eventId: resolveLogEventId(orderId, eventType),
      result,
    });
    return result;
  }

  if (order[flagColumn] === true) {
    const result = { sent: false, skipped: true, reason: "already_sent" } as const;
    recordDispatchOutcome(supabase, {
      orderId,
      productId: order.product_id as string | null,
      eventType,
      eventId: resolveLogEventId(orderId, eventType, order),
      result,
    });
    return result;
  }

  if (eventType === "purchase" && order.status !== "confirmed") {
    const result = { sent: false, skipped: true, reason: "status_not_confirmed" } as const;
    recordDispatchOutcome(supabase, {
      orderId,
      productId: order.product_id as string | null,
      eventType,
      eventId: resolveLogEventId(orderId, eventType, order),
      result,
    });
    return result;
  }
  if (eventType === "cancel" && order.status !== "cancelled") {
    const result = { sent: false, skipped: true, reason: "status_not_cancelled" } as const;
    recordDispatchOutcome(supabase, {
      orderId,
      productId: order.product_id as string | null,
      eventType,
      eventId: resolveLogEventId(orderId, eventType, order),
      result,
    });
    return result;
  }

  if (!order.product_id) {
    console.warn("[meta] CAPI skipped: order has no product_id", { orderId, eventType });
    const result = { sent: false, skipped: true, reason: "missing_product_id" } as const;
    recordDispatchOutcome(supabase, {
      orderId,
      eventType,
      eventId: resolveLogEventId(orderId, eventType, order),
      result,
    });
    return result;
  }

  const claimed = await claimMetaDispatch(supabase, orderId, eventType);
  if (!claimed) {
    const result = { sent: false, skipped: true, reason: "already_sent" } as const;
    recordDispatchOutcome(supabase, {
      orderId,
      productId: order.product_id as string,
      eventType,
      eventId: resolveLogEventId(orderId, eventType, order),
      result,
    });
    return result;
  }

  const eventId =
    eventType === "lead"
      ? resolveLeadEventIdForOrder(order)
      : transactionalEventId(orderId, eventType);
  const pixelId = resolveServerMetaPixelId() || "";

  const { data: product } = await supabase
    .from("products")
    .select("name_ar, name_fr, default_language, deleted_at, slug")
    .eq("id", order.product_id as string)
    .maybeSingle();

  if (!product || product.deleted_at != null) {
    await releaseMetaDispatchClaim(supabase, orderId, eventType);
    console.warn("[meta] CAPI skipped: product not found for order", {
      orderId,
      eventType,
      productId: order.product_id,
    });
    const result = { sent: false, skipped: true, reason: "product_not_found" } as const;
    recordDispatchOutcome(supabase, {
      orderId,
      productId: order.product_id as string,
      eventType,
      eventId,
      result,
    });
    return result;
  }

  const productCustomData = buildMetaProductCustomData({
    productId: order.product_id as string,
    productName: resolveMetaProductDisplayName({
      name_ar: product.name_ar as string | null,
      name_fr: product.name_fr as string | null,
      default_language: product.default_language as "ar" | "fr" | null,
    }),
    quantity: Number(order.quantity) > 0 ? Number(order.quantity) : 1,
  });

  if (!productCustomData?.content_ids?.length) {
    await releaseMetaDispatchClaim(supabase, orderId, eventType);
    console.warn("[meta] CAPI skipped: unresolved content_ids", { orderId, eventType });
    const result = { sent: false, skipped: true, reason: "missing_content_ids" } as const;
    recordDispatchOutcome(supabase, {
      orderId,
      productId: order.product_id as string,
      eventType,
      eventId,
      result,
    });
    return result;
  }

  console.warn("[meta] CAPI dispatch attempt", {
    orderId,
    eventType,
    eventIdPrefix:
      eventType === "lead" ? resolveLeadEventIdForOrder(order).slice(0, 20) : undefined,
    hasPixelId: Boolean(pixelId),
    tokenConfigured: Boolean(process.env.META_CAPI_ACCESS_TOKEN?.trim()),
  });

  if (!pixelId) {
    await releaseMetaDispatchClaim(supabase, orderId, eventType);
    console.warn("[meta] CAPI skipped: META_PIXEL_ID not set", {
      orderId,
      eventType,
    });
    const result = { sent: false, skipped: true, reason: "missing_meta_data" } as const;
    recordDispatchOutcome(supabase, {
      orderId,
      productId: order.product_id as string,
      eventType,
      eventId,
      result,
    });
    return result;
  }

  const headers =
    eventType === "lead" ? (context.requestHeaders ?? new Headers()) : null;
  const eventName =
    eventType === "lead" ? "Lead" : eventType === "purchase" ? "Purchase" : "CancelledLead";

  const storedSourceUrl =
    (order.meta_event_source_url as string | null)?.trim() ||
    buildPublicProductUrl((product.slug as string | null) ?? "") ||
    null;

  const orderMoney = metaPurchaseMoneyFromOrderTotal(
    Number(order.total_price),
    (order.currency as string) ?? "MRU",
  );

  const customData =
    eventType === "purchase" || eventType === "lead" || eventType === "cancel"
      ? buildMetaOrderValueCustomData({
          ...orderMoney,
          productId: order.product_id as string,
          productName: productCustomData.content_name,
          quantity: Number(order.quantity) > 0 ? Number(order.quantity) : 1,
        })
      : productCustomData;

  if (
    !customData ||
    !("content_ids" in customData) ||
    !Array.isArray(customData.content_ids) ||
    customData.content_ids.length === 0
  ) {
    await releaseMetaDispatchClaim(supabase, orderId, eventType);
    console.warn("[meta] CAPI skipped: missing content_ids in payload", { orderId, eventType });
    const result = { sent: false, skipped: true, reason: "missing_content_ids" } as const;
    recordDispatchOutcome(supabase, {
      orderId,
      productId: order.product_id as string,
      eventType,
      eventId,
      result,
    });
    return result;
  }

  const session = orderCustomerSessionContext(order);
  if (session.missingStoredSession) {
    console.warn("[meta] CAPI missing stored shopper session (IP/UA omitted)", {
      orderId,
      eventType,
      hasIp: Boolean(session.clientIpAddress),
      hasUserAgent: Boolean(session.clientUserAgent),
      hasFbp: Boolean(session.fbp),
      hasFbc: Boolean(session.fbc),
    });
  }

  try {
    const capi = await sendMetaEvent({
      pixelId,
      eventName,
      eventId,
      eventSourceUrl: storedSourceUrl,
      requestHeaders: headers,
      eventTimeSec: eventType === "lead" ? context.eventTimeSec : undefined,
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
      const result = { sent: false, reason: capi.reason ?? "capi_failed" } as const;
      recordDispatchOutcome(supabase, {
        orderId,
        productId: order.product_id as string,
        eventType,
        eventId,
        result,
        detail: capi.detail,
      });
      return result;
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
      const result = { sent: false, skipped: true, reason: "already_sent" } as const;
      recordDispatchOutcome(supabase, {
        orderId,
        productId: order.product_id as string,
        eventType,
        eventId,
        result,
        detail: capi.detail,
      });
      return result;
    }

    recordDispatchOutcome(supabase, {
      orderId,
      productId: order.product_id as string,
      eventType,
      eventId,
      result: { sent: true },
      detail: capi.detail,
    });
    return { sent: true };
  } catch (e) {
    await releaseMetaDispatchClaim(supabase, orderId, eventType);
    throw e;
  }
}
