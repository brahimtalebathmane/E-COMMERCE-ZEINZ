import type { SupabaseClient } from "@supabase/supabase-js";
import { metaPurchaseMoneyFromOrderTotal } from "@/lib/meta-purchase-tracking";
import { resolveServerMetaPixelId, resolveCountryPixelIds } from "@/lib/meta-pixel-id";
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
import { sendMetaEvent, type MetaActionSource } from "@/utils/meta";
import { buildMetaCustomerKey } from "@/lib/meta-user-data";
import { isCtwaClickAttributable } from "@/lib/meta/ctwa-window";
import { sanitizePhoneForMetaE164 } from "@/lib/meta-user-data";

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

/** WhatsApp Business Account id — Meta requires it alongside `ctwa_clid`. */
function resolveWhatsAppBusinessAccountId(): string | null {
  const raw = process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID?.trim().replace(/^['"]|['"]$/g, "");
  return raw || null;
}

/**
 * The dataset a business_messaging event must be sent to. Meta rejects these on
 * the website pixel with error_subcode 2804132 ("No WhatsApp Business Account
 * Linked to This Dataset"); the WABA has its own dataset id, created once with
 * `POST /{waba-id}/dataset`. Without it there is no point attempting the
 * business_messaging shape at all.
 */
function resolveWhatsAppDatasetId(): string | null {
  const raw = process.env.META_WHATSAPP_DATASET_ID?.trim().replace(/^['"]|['"]$/g, "");
  return raw || null;
}

/**
 * Last-chance lookup for a Click-to-WhatsApp click id.
 *
 * `createWhatsAppSaleAction` resolves the click id when the ORDER IS CREATED. If
 * the customer's ad-referral message is captured moments later — the WhatsApp
 * worker and the admin are racing — the order is stored with no click id and the
 * sale loses its attribution permanently, even though the conversation clearly
 * came from an ad. One sale in nineteen was lost this way.
 *
 * So the click id is resolved again HERE, at dispatch time, from the same
 * `whatsapp_contacts` row the sale form reads. Only a click inside Meta's
 * attribution window is used: an older one would be accepted by Meta but
 * credited to nothing, while making the admin report claim an attribution that
 * does not exist.
 *
 * The value found is written back to the order so the database and the event
 * agree — otherwise the ad-performance report would keep counting this sale as
 * organic.
 */
async function backfillCtwaFromContact(
  supabase: SupabaseClient,
  orderId: string,
  phone: string | null,
): Promise<{ ctwaClid: string | null; adSourceId: string | null }> {
  const normalized = sanitizePhoneForMetaE164(phone ?? "");
  if (!normalized) return { ctwaClid: null, adSourceId: null };

  try {
    const { data, error } = await supabase
      .from("whatsapp_contacts")
      .select("last_ctwa_clid, last_ad_source_id, last_ad_clicked_at")
      .eq("phone", normalized)
      .maybeSingle();
    if (error || !data) return { ctwaClid: null, adSourceId: null };

    const ctwaClid = (data.last_ctwa_clid as string | null)?.trim() || null;
    if (!ctwaClid) return { ctwaClid: null, adSourceId: null };
    if (!isCtwaClickAttributable(data.last_ad_clicked_at as string | null)) {
      return { ctwaClid: null, adSourceId: null };
    }

    const adSourceId = (data.last_ad_source_id as string | null)?.trim() || null;

    // Best-effort: a failed write must not block the event it was meant to enrich.
    const { error: writeError } = await supabase
      .from("orders")
      .update({ meta_ctwa_clid: ctwaClid, meta_ad_source_id: adSourceId })
      .eq("id", orderId)
      .is("meta_ctwa_clid", null);
    if (writeError) {
      console.warn("[meta] CTWA backfill found a click id but could not store it", {
        orderId,
        error: writeError.message,
      });
    } else {
      console.warn("[meta] CTWA click id backfilled from the conversation at dispatch", {
        orderId,
        adSourceId,
      });
    }

    return { ctwaClid, adSourceId };
  } catch (error) {
    console.warn("[meta] CTWA backfill lookup failed", {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ctwaClid: null, adSourceId: null };
  }
}

/** Token for the WhatsApp dataset — needs whatsapp_business_manage_events. */
function resolveWhatsAppCapiToken(): string | null {
  const raw = process.env.META_WHATSAPP_CAPI_ACCESS_TOKEN?.trim().replace(/^['"]|['"]$/g, "");
  return raw || null;
}

/**
 * Meta CAPI `action_source`: "business_messaging" for a Purchase that can be
 * tied back to a Click-to-WhatsApp ad conversation (ctwa_clid + WABA id both
 * present); otherwise "website" for real storefront checkouts, "chat" for a
 * sale recorded against a WhatsApp conversation, or the historical
 * "phone_call" / "other" channels retained on old manual-sale rows. Falls
 * back to "phone_call" if a manual order somehow has no channel stored.
 */
function resolveOrderActionSource(
  order: Record<string, unknown>,
  eventType: MetaDispatchEventType,
  ctwaClid: string | null,
  wabaId: string | null,
): MetaActionSource {
  if (eventType === "purchase" && ctwaClid && wabaId) return "business_messaging";
  if (order.source !== "manual") return "website";
  const channel = order.manual_sale_channel as string | null;
  // A sale recorded against a WhatsApp conversation is a chat conversion, not a
  // phone call — Meta documents "chat" as "made via a messaging app". Only the
  // pre-existing historical channels fall through to the old values.
  if (channel === "whatsapp") return "chat";
  return channel === "other" ? "other" : "phone_call";
}

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
      "id, product_id, status, customer_name, phone, total_price, currency, quantity, source, manual_sale_channel, meta_event_id, meta_event_source_url, meta_fbp, meta_fbc, meta_ctwa_clid, meta_client_ip_address, meta_client_user_agent, meta_lead_sent, meta_purchase_sent, meta_cancel_sent, deleted_at",
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

  const { data: product } = await supabase
    .from("products")
    .select("name_ar, name_fr, default_language, deleted_at, slug, country_id")
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

  const countryPixelIds = await resolveCountryPixelIds(supabase, product.country_id as string | null);
  const pixelId = resolveServerMetaPixelId(countryPixelIds.server) || "";

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
    // A conversation sale has no browser behind it by definition — fbp/fbc are
    // browser cookies and the shopper never opened a page. Logging that as a
    // warning on every WhatsApp sale trains everyone to ignore the line, which
    // then hides the case that IS a defect: a storefront order missing its own
    // session.
    const isConversationSale =
      (order.manual_sale_channel as string | null) === "whatsapp" ||
      (order.source as string | null) === "manual";
    const message = isConversationSale
      ? "[meta] CAPI conversation sale — no browser session (expected for this channel)"
      : "[meta] CAPI missing stored shopper session (IP/UA omitted)";
    const detail = {
      orderId,
      eventType,
      hasIp: Boolean(session.clientIpAddress),
      hasUserAgent: Boolean(session.clientUserAgent),
      hasFbp: Boolean(session.fbp),
      hasFbc: Boolean(session.fbc),
    };
    if (isConversationSale) console.info(message, detail);
    else console.warn(message, detail);
  }

  let ctwaClid = (order.meta_ctwa_clid as string | null)?.trim() || null;
  // Only WhatsApp sales can gain a click id after the fact, and only a purchase
  // is worth the extra read — a cancel carries no attribution value.
  if (
    !ctwaClid &&
    eventType === "purchase" &&
    (order.manual_sale_channel as string | null) === "whatsapp"
  ) {
    const backfilled = await backfillCtwaFromContact(
      supabase,
      orderId,
      order.phone as string | null,
    );
    ctwaClid = backfilled.ctwaClid;
  }
  const wabaIdEnv = resolveWhatsAppBusinessAccountId();
  const whatsappDatasetId = resolveWhatsAppDatasetId();
  // All three are required together. A business_messaging event with no dataset
  // is rejected (2804132) and a dataset with no click id has nothing to
  // attribute — so treat a partial configuration as "not configured" rather
  // than sending a request that is known to fail.
  const wabaId = wabaIdEnv && whatsappDatasetId ? wabaIdEnv : null;
  if (ctwaClid && !wabaId) {
    console.warn(
      "[meta] CTWA click id present but the business_messaging destination is incomplete — falling back to offline action_source",
      {
        orderId,
        eventType,
        hasWabaId: Boolean(wabaIdEnv),
        hasDatasetId: Boolean(whatsappDatasetId),
      },
    );
  }
  const actionSource = resolveOrderActionSource(order, eventType, ctwaClid, wabaId);
  const isBusinessMessaging = actionSource === "business_messaging";

  try {
    /**
     * One shape of the same event. Called twice at most: once as chosen, and — if
     * Meta rejects a business_messaging attempt — once more with the offline
     * shape. `eventId` is identical across both, so a first attempt that did
     * reach Meta is deduplicated rather than double-counted.
     */
    const sendAs = (source: MetaActionSource) =>
      sendMetaEvent({
        pixelId,
        eventName,
        eventId,
        eventSourceUrl: storedSourceUrl,
        requestHeaders: headers,
        eventTimeSec: eventType === "lead" ? context.eventTimeSec : undefined,
        actionSource: source,
        messagingChannel: source === "business_messaging" ? "whatsapp" : undefined,
        datasetId: source === "business_messaging" ? whatsappDatasetId : null,
        accessTokenOverride:
          source === "business_messaging" ? resolveWhatsAppCapiToken() : null,
        userData: {
          name: order.customer_name as string | null,
          phone: order.phone as string | null,
          fbp: session.fbp,
          fbc: session.fbc,
          clientIpAddress: session.clientIpAddress,
          clientUserAgent: session.clientUserAgent,
          // Stable per-shopper key; the order id only remains as a last resort so
          // an unparseable phone still yields *some* external_id.
          externalId:
            buildMetaCustomerKey(order.phone as string | null) ?? (order.id as string),
          country: countryPixelIds.isoCode,
          // Both are only valid together, and only on a business_messaging event.
          ctwaClid: source === "business_messaging" ? ctwaClid : null,
          whatsappBusinessAccountId: source === "business_messaging" ? wabaId : null,
        },
        customData,
      });

    let capi = await sendAs(actionSource);

    /**
     * A rejected business_messaging event means Meta refused the SHAPE, not the
     * sale — most often subcode 2804117, "the ctwa_clid was not generated by the
     * Page associated with this whatsapp_business_account_id". Losing the
     * Purchase over that is strictly worse than losing the ad attribution, so
     * retry once as the plain offline event this order would have sent anyway.
     *
     * Only payload rejections qualify: a missing token or an exhausted network
     * retry would fail identically in any shape.
     */
    if (
      !capi.ok &&
      isBusinessMessaging &&
      (capi.reason === "rejected" || capi.reason === "http_error")
    ) {
      const fallback = resolveOrderActionSource(order, eventType, null, null);
      console.warn(
        "[meta] business_messaging rejected — resending without ad attribution",
        {
          orderId,
          eventType,
          reason: capi.reason,
          errorSubcode: capi.errorSubcode,
          fallbackActionSource: fallback,
        },
      );
      capi = await sendAs(fallback);
    }

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
