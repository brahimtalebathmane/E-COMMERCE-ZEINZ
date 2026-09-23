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
import {
  sendMetaEvent,
  type MetaActionSource,
  type SendMetaEventResult,
} from "@/utils/meta";
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
 * `META_WHATSAPP_PIXEL_LEG` — "on" (default) or "off".
 *
 * An attributable WhatsApp Purchase goes to two destinations: the website pixel
 * (the "primary" leg, what every campaign optimised on until the messaging goal)
 * and the WABA dataset (the "attribution" leg, the only source the
 * "Maximize number of purchases through messaging" goal reads). The pixel leg is
 * a bridge: it lets the campaigns fall back to the pixel within a day if the
 * messaging goal underperforms. Once it has proven itself the pixel leg can be
 * retired here, without a deploy.
 *
 * Only an explicit "off" disables it, and only for orders whose attribution leg
 * is actually being sent — a WhatsApp sale with no click id, and every storefront
 * sale, still reach the pixel whatever this says. Unset or malformed means "on".
 */
function isWhatsAppPixelLegEnabled(): boolean {
  const raw = process.env.META_WHATSAPP_PIXEL_LEG?.trim()
    .replace(/^['"]|['"]$/g, "")
    .toLowerCase();
  return raw !== "off";
}

/** Where a WhatsApp attribution event is sent. Both ids are required together. */
export type WhatsAppDatasetDestination = { datasetId: string; wabaId: string };

/**
 * The WABA dataset, or null when it is not fully configured. A business_messaging
 * event with no dataset is rejected (2804132) and one with no WABA id cannot carry
 * a `ctwa_clid` — so a partial configuration counts as "not configured" rather
 * than sending a request that is known to fail.
 */
export function resolveWhatsAppDatasetDestination(): WhatsAppDatasetDestination | null {
  const datasetId = resolveWhatsAppDatasetId();
  const wabaId = resolveWhatsAppBusinessAccountId();
  return datasetId && wabaId ? { datasetId, wabaId } : null;
}

function isWhatsAppSale(order: Record<string, unknown>): boolean {
  return (
    order.source === "manual" &&
    (order.manual_sale_channel as string | null) === "whatsapp"
  );
}

/**
 * Meta CAPI `action_source` for the pixel: "website" for real storefront
 * checkouts, "chat" for a sale recorded against a WhatsApp conversation, or the
 * historical "phone_call" / "other" channels retained on old manual-sale rows.
 * Falls back to "phone_call" if a manual order somehow has no channel stored.
 *
 * "business_messaging" is never a pixel action source — it belongs to the
 * attribution leg alone, see `buildLegParams`.
 */
function resolveOrderActionSource(order: Record<string, unknown>): MetaActionSource {
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

/** Every order column the dispatcher and the dataset resend read. */
export const ORDER_DISPATCH_SELECT =
  "id, product_id, status, customer_name, phone, total_price, currency, quantity, source, manual_sale_channel, meta_event_id, meta_event_source_url, meta_fbp, meta_fbc, meta_ctwa_clid, meta_client_ip_address, meta_client_user_agent, meta_lead_sent, meta_purchase_sent, meta_purchase_dataset_sent, meta_cancel_sent, ordered_at, deleted_at";

/**
 * Everything a CAPI event for an order needs that does not depend on WHERE it
 * is sent. The live dispatcher and the dataset resend both build their payload
 * from this, so there is exactly one implementation of it.
 */
export type OrderEventPayload = {
  pixelId: string;
  eventId: string;
  eventName: "Lead" | "Purchase" | "CancelledLead";
  storedSourceUrl: string | null;
  headers: Headers | null;
  customData: NonNullable<ReturnType<typeof buildMetaOrderValueCustomData>>;
  session: ReturnType<typeof orderCustomerSessionContext>;
  countryIsoCode: string | null;
};

type PrepareOrderEventResult =
  | { ok: true; payload: OrderEventPayload }
  | {
      ok: false;
      reason: "product_not_found" | "missing_content_ids" | "missing_meta_data";
    };

export async function prepareOrderEventPayload(
  supabase: SupabaseClient,
  order: Record<string, unknown>,
  eventType: MetaDispatchEventType,
  eventId: string,
  context: MetaClientContext = {},
): Promise<PrepareOrderEventResult> {
  const orderId = order.id as string;

  const { data: product } = await supabase
    .from("products")
    .select("name_ar, name_fr, default_language, deleted_at, slug, country_id")
    .eq("id", order.product_id as string)
    .maybeSingle();

  if (!product || product.deleted_at != null) {
    console.warn("[meta] CAPI skipped: product not found for order", {
      orderId,
      eventType,
      productId: order.product_id,
    });
    return { ok: false, reason: "product_not_found" };
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
    console.warn("[meta] CAPI skipped: unresolved content_ids", { orderId, eventType });
    return { ok: false, reason: "missing_content_ids" };
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
    console.warn("[meta] CAPI skipped: META_PIXEL_ID not set", {
      orderId,
      eventType,
    });
    return { ok: false, reason: "missing_meta_data" };
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

  const customData = buildMetaOrderValueCustomData({
    ...orderMoney,
    productId: order.product_id as string,
    productName: productCustomData.content_name,
    quantity: Number(order.quantity) > 0 ? Number(order.quantity) : 1,
  });

  if (
    !customData ||
    !Array.isArray(customData.content_ids) ||
    customData.content_ids.length === 0
  ) {
    console.warn("[meta] CAPI skipped: missing content_ids in payload", { orderId, eventType });
    return { ok: false, reason: "missing_content_ids" };
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

  return {
    ok: true,
    payload: {
      pixelId,
      eventId,
      eventName,
      storedSourceUrl,
      headers,
      customData,
      session,
      countryIsoCode: countryPixelIds.isoCode,
    },
  };
}

type EventLeg =
  | { kind: "primary"; actionSource: MetaActionSource }
  | { kind: "attribution"; ctwaClid: string; destination: WhatsAppDatasetDestination };

/**
 * One destination of the same event. `event_id` is identical on both legs; the
 * two destinations are separate datasets, so Meta does not deduplicate across
 * them — and does not deduplicate business_messaging events within the dataset
 * either. `meta_purchase_dataset_sent` is the only guard against a double send
 * on the attribution leg.
 */
function buildLegParams(
  order: Record<string, unknown>,
  payload: OrderEventPayload,
  leg: EventLeg,
  eventTimeSec?: number,
): Parameters<typeof sendMetaEvent>[0] {
  const attribution = leg.kind === "attribution" ? leg : null;
  return {
    // The attribution leg never names the pixel. With nothing to fall back to,
    // a missing dataset id fails closed instead of landing a second Purchase on
    // the pixel.
    pixelId: attribution ? null : payload.pixelId,
    eventName: payload.eventName,
    eventId: payload.eventId,
    eventSourceUrl: payload.storedSourceUrl,
    requestHeaders: payload.headers,
    eventTimeSec,
    actionSource: attribution ? "business_messaging" : leg.kind === "primary" ? leg.actionSource : undefined,
    messagingChannel: attribution ? "whatsapp" : undefined,
    datasetId: attribution ? attribution.destination.datasetId : null,
    accessTokenOverride: attribution ? resolveWhatsAppCapiToken() : null,
    leg: leg.kind,
    userData: {
      name: order.customer_name as string | null,
      phone: order.phone as string | null,
      fbp: payload.session.fbp,
      fbc: payload.session.fbc,
      clientIpAddress: payload.session.clientIpAddress,
      clientUserAgent: payload.session.clientUserAgent,
      // Stable per-shopper key; the order id only remains as a last resort so
      // an unparseable phone still yields *some* external_id.
      externalId:
        buildMetaCustomerKey(order.phone as string | null) ?? (order.id as string),
      country: payload.countryIsoCode,
      // Both are only valid together, and only on a business_messaging event.
      ctwaClid: attribution ? attribution.ctwaClid : null,
      whatsappBusinessAccountId: attribution ? attribution.destination.wabaId : null,
    },
    customData: payload.customData,
  };
}

/** A thrown send becomes an ordinary failure, so one leg can never sink the other. */
function settledSendResult(
  settled: PromiseSettledResult<SendMetaEventResult | null>,
): SendMetaEventResult | null {
  if (settled.status === "fulfilled") return settled.value;
  return {
    ok: false,
    reason: "network_error",
    detail: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
  };
}

/**
 * The WhatsApp dataset leg of a Purchase. Shared by the live dispatcher and the
 * dataset resend — the resend passes the real purchase time, the live path
 * sends "now".
 */
export function sendAttributionLeg(
  order: Record<string, unknown>,
  payload: OrderEventPayload,
  ctwaClid: string,
  destination: WhatsAppDatasetDestination,
  eventTimeSec?: number,
): Promise<SendMetaEventResult> {
  return sendMetaEvent(
    buildLegParams(order, payload, { kind: "attribution", ctwaClid, destination }, eventTimeSec),
  );
}

/**
 * Short, greppable reason for a dataset gap: when, why, and Meta's subcode —
 * enough to tell a token problem, a 2804117 WABA mismatch and a network blip
 * apart at a glance on /admin/meta.
 */
export function formatAttributionLegError(
  result: Extract<SendMetaEventResult, { ok: false }> | { reason: string; detail?: string; errorSubcode?: number },
  now: Date = new Date(),
): string {
  const subcode = result.errorSubcode != null ? ` subcode=${result.errorSubcode}` : "";
  const detail = result.detail?.trim() ? ` ${result.detail.trim().slice(0, 300)}` : "";
  return `[${now.toISOString()}] ${result.reason}${subcode}${detail}`;
}

/**
 * Persists the dataset leg's outcome. Acceptance flips the flag with the same
 * guarded-update pattern as `meta_purchase_sent`; a failure only records why.
 * Never throws — the sale's own outcome must not depend on this write.
 */
export async function recordAttributionLegOutcome(
  supabase: SupabaseClient,
  orderId: string,
  result: SendMetaEventResult | { ok: false; reason: string; detail?: string },
): Promise<void> {
  try {
    const { error } = result.ok
      ? await supabase
          .from("orders")
          .update({ meta_purchase_dataset_sent: true, meta_dataset_last_error: null })
          .eq("id", orderId)
          .eq("meta_purchase_dataset_sent", false)
      : await supabase
          .from("orders")
          .update({ meta_dataset_last_error: formatAttributionLegError(result) })
          .eq("id", orderId);
    if (error) {
      console.error("[meta] could not record the attribution leg outcome", {
        orderId,
        accepted: result.ok,
        error: error.message,
      });
    }
  } catch (error) {
    console.error("[meta] could not record the attribution leg outcome", {
      orderId,
      accepted: result.ok,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Single-path Meta CAPI dispatcher with idempotency ledger.
 * Callers must enforce order status preconditions before invoking.
 *
 * A Purchase for a WhatsApp sale carrying an attributable click id is sent to
 * two destinations at once — see `isWhatsAppPixelLegEnabled`. The pixel leg
 * alone decides the result; the dataset leg is tracked on its own column.
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
    .select(ORDER_DISPATCH_SELECT)
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

  const prepared = await prepareOrderEventPayload(supabase, order, eventType, eventId, context);
  if (!prepared.ok) {
    await releaseMetaDispatchClaim(supabase, orderId, eventType);
    const result = { sent: false, skipped: true, reason: prepared.reason } as const;
    recordDispatchOutcome(supabase, {
      orderId,
      productId: order.product_id as string,
      eventType,
      eventId,
      result,
    });
    return result;
  }
  const payload = prepared.payload;

  let ctwaClid = (order.meta_ctwa_clid as string | null)?.trim() || null;
  // Only WhatsApp sales can gain a click id after the fact, and only a purchase
  // is worth the extra read — a cancel carries no attribution value.
  if (!ctwaClid && eventType === "purchase" && isWhatsAppSale(order)) {
    const backfilled = await backfillCtwaFromContact(
      supabase,
      orderId,
      order.phone as string | null,
    );
    ctwaClid = backfilled.ctwaClid;
  }

  const destination = eventType === "purchase" ? resolveWhatsAppDatasetDestination() : null;
  const hasAttributableClick = eventType === "purchase" && isWhatsAppSale(order) && Boolean(ctwaClid);
  if (hasAttributableClick && !destination) {
    console.warn(
      "[meta] CTWA click id present but the WhatsApp dataset is not configured — attribution leg not sent",
      {
        orderId,
        eventType,
        hasWabaId: Boolean(resolveWhatsAppBusinessAccountId()),
        hasDatasetId: Boolean(resolveWhatsAppDatasetId()),
      },
    );
  }

  // The attribution leg is owed exactly once per order: an earlier attempt that
  // reached the dataset — while the pixel leg failed and released the claim —
  // must not be repeated when the pixel leg is retried.
  const attributable = hasAttributableClick && destination != null;
  const attributionAlreadySent = order.meta_purchase_dataset_sent === true;
  const sendAttribution = attributable && !attributionAlreadySent;
  const sendPixel = !(attributable && !isWhatsAppPixelLegEnabled());
  if (!sendPixel) {
    console.warn(
      "[meta] pixel leg disabled by META_WHATSAPP_PIXEL_LEG — attribution leg is authoritative",
      { orderId, eventType, attributionAlreadySent },
    );
  }

  try {
    // Awaited together, never fire-and-forget: Netlify freezes the function as
    // soon as the response returns, which can kill an un-awaited request before
    // it leaves the box.
    const [primarySettled, attributionSettled] = await Promise.allSettled([
      sendPixel
        ? sendMetaEvent(
            buildLegParams(
              order,
              payload,
              { kind: "primary", actionSource: resolveOrderActionSource(order) },
              eventType === "lead" ? context.eventTimeSec : undefined,
            ),
          )
        : Promise.resolve(null),
      sendAttribution && ctwaClid && destination
        ? sendAttributionLeg(order, payload, ctwaClid, destination)
        : Promise.resolve(null),
    ]);
    const primary = settledSendResult(primarySettled);
    const attribution = settledSendResult(attributionSettled);

    // Recorded BEFORE `meta_purchase_sent` is set: the dataset resend only picks
    // up orders whose pixel leg is marked sent, so by the time an order becomes
    // visible to it, its live attribution leg has already settled.
    if (attribution) {
      if (!attribution.ok) {
        console.warn(
          sendPixel
            ? "[meta] attribution leg rejected — the sale stands on the pixel leg"
            : "[meta] attribution leg rejected — pixel leg disabled, the sale is not sent",
          {
            orderId,
            eventType,
            reason: attribution.reason,
            errorSubcode: attribution.errorSubcode,
            detail: attribution.detail?.slice(0, 300),
          },
        );
      }
      await recordAttributionLegOutcome(supabase, orderId, attribution);
    } else if (hasAttributableClick && !destination) {
      await recordAttributionLegOutcome(supabase, orderId, {
        ok: false,
        reason: "dataset_not_configured",
      });
    }

    // The pixel leg decides whether the sale counts as sent. Only when it is
    // switched off does the attribution leg take its place — and if that leg
    // already reached the dataset on an earlier attempt, there is nothing left
    // to send.
    const capi: SendMetaEventResult =
      (sendPixel ? primary : attribution) ?? { ok: true, detail: "attribution_already_sent" };

    if (!capi.ok) {
      await releaseMetaDispatchClaim(supabase, orderId, eventType);
      console.warn("[meta] CAPI dispatch failed", {
        orderId,
        eventType,
        leg: sendPixel ? "primary" : "attribution",
        pixelIdPrefix: payload.pixelId.slice(0, 6),
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
