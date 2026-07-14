import type { SupabaseClient } from "@supabase/supabase-js";
import { toMetaPixelPurchaseMoney } from "@/lib/currency";
import { resolveServerMetaPixelId } from "@/lib/meta-pixel-id";
import {
  buildMetaOrderValueCustomData,
  resolveMetaProductDisplayName,
} from "@/lib/meta-product-custom-data";
import { logMetaEventOutcomeFireAndForget } from "@/lib/meta/event-log";
import { buildPublicProductUrl } from "@/lib/site-url";
import { sendMetaEvent, resolveClientIpAddress } from "@/utils/meta";

export type InitiateCheckoutDispatchResult =
  | { sent: true; skipped?: false }
  | { sent: false; skipped: true; reason: string }
  | { sent: false; skipped?: false; reason: string };

const FUNNEL_EVENT_TYPE = "initiate_checkout" as const;

function recordInitiateCheckoutOutcome(
  supabase: SupabaseClient,
  params: {
    eventId: string;
    productId?: string | null;
    result: InitiateCheckoutDispatchResult;
    detail?: string | null;
    attemptCount?: number;
  },
): void {
  if (params.result.sent) {
    logMetaEventOutcomeFireAndForget({
      supabase,
      eventType: "initiate_checkout",
      eventId: params.eventId,
      productId: params.productId ?? null,
      state: "success",
      detail: params.detail,
      attemptCount: params.attemptCount,
    });
    return;
  }
  if (params.result.skipped) {
    logMetaEventOutcomeFireAndForget({
      supabase,
      eventType: "initiate_checkout",
      eventId: params.eventId,
      productId: params.productId ?? null,
      state: "skipped",
      reason: params.result.reason,
      detail: params.detail,
      attemptCount: params.attemptCount,
      notifyOnFailure: false,
    });
    return;
  }
  logMetaEventOutcomeFireAndForget({
    supabase,
    eventType: "initiate_checkout",
    eventId: params.eventId,
    productId: params.productId ?? null,
    state: "failed",
    reason: params.result.reason,
    detail: params.detail,
    attemptCount: params.attemptCount,
  });
}

async function claimFunnelMetaDispatch(
  supabase: SupabaseClient,
  eventId: string,
  productId: string,
): Promise<"claimed" | "already_sent" | "product_mismatch"> {
  const { error } = await supabase.from("funnel_meta_dispatches").insert({
    event_id: eventId,
    event_type: FUNNEL_EVENT_TYPE,
    product_id: productId,
  });
  if (!error) return "claimed";
  if (error.code === "23505") {
    const { data: existing } = await supabase
      .from("funnel_meta_dispatches")
      .select("product_id")
      .eq("event_id", eventId)
      .eq("event_type", FUNNEL_EVENT_TYPE)
      .maybeSingle();
    if (
      existing?.product_id &&
      String(existing.product_id) !== productId
    ) {
      console.error("[meta] InitiateCheckout event_id reused across products", {
        eventIdPrefix: eventId.slice(0, 12),
        requestedProductId: productId,
        ledgerProductId: existing.product_id,
      });
      return "product_mismatch";
    }
    return "already_sent";
  }
  throw new Error(error.message);
}

async function releaseFunnelMetaDispatchClaim(
  supabase: SupabaseClient,
  eventId: string,
): Promise<void> {
  await supabase
    .from("funnel_meta_dispatches")
    .delete()
    .eq("event_id", eventId)
    .eq("event_type", FUNNEL_EVENT_TYPE);
}

export type InitiateCheckoutDispatchInput = {
  productId: string;
  eventId: string;
  eventSourceUrl?: string | null;
  eventTimeSec?: number;
  requestHeaders?: Headers;
  metaFbp?: string | null;
  metaFbc?: string | null;
};

/**
 * Server CAPI InitiateCheckout — paired with browser Pixel via shared funnel `event_id`.
 * Idempotency: `funnel_meta_dispatches` ledger keyed by (event_id, event_type).
 */
export async function dispatchInitiateCheckoutMetaEvent(
  supabase: SupabaseClient,
  input: InitiateCheckoutDispatchInput,
): Promise<InitiateCheckoutDispatchResult> {
  const eventId = input.eventId.trim();
  const productId = input.productId.trim();
  if (!eventId || !productId) {
    const result = { sent: false, skipped: true, reason: "missing_meta_data" } as const;
    recordInitiateCheckoutOutcome(supabase, { eventId: eventId || "unknown", productId, result });
    return result;
  }

  const claimResult = await claimFunnelMetaDispatch(supabase, eventId, productId);
  if (claimResult === "product_mismatch") {
    const result = { sent: false, reason: "event_id_product_mismatch" } as const;
    recordInitiateCheckoutOutcome(supabase, { eventId, productId, result });
    return result;
  }
  if (claimResult === "already_sent") {
    const result = { sent: false, skipped: true, reason: "already_sent" } as const;
    recordInitiateCheckoutOutcome(supabase, { eventId, productId, result });
    return result;
  }

  const pixelId = resolveServerMetaPixelId() || "";
  if (!pixelId) {
    await releaseFunnelMetaDispatchClaim(supabase, eventId);
    console.warn("[meta] InitiateCheckout CAPI skipped: META_PIXEL_ID not set", { eventId });
    const result = { sent: false, skipped: true, reason: "missing_meta_data" } as const;
    recordInitiateCheckoutOutcome(supabase, { eventId, productId, result });
    return result;
  }

  const { data: product, error: productErr } = await supabase
    .from("products")
    .select("id, price, discount_price, name_ar, name_fr, default_language, deleted_at, test_status, slug")
    .eq("id", productId)
    .maybeSingle();

  if (productErr) throw new Error(productErr.message);
  if (!product || product.deleted_at != null) {
    await releaseFunnelMetaDispatchClaim(supabase, eventId);
    const result = { sent: false, skipped: true, reason: "product_not_found" } as const;
    recordInitiateCheckoutOutcome(supabase, { eventId, productId, result });
    return result;
  }

  const totalMru =
    product.discount_price != null
      ? Number(product.discount_price)
      : Number(product.price);
  const { value, currency } = toMetaPixelPurchaseMoney(totalMru, "MRU");
  const productName = resolveMetaProductDisplayName({
    name_ar: product.name_ar as string | null,
    name_fr: product.name_fr as string | null,
    default_language: product.default_language as "ar" | "fr" | null,
  });

  const customData = buildMetaOrderValueCustomData({
    value,
    currency,
    productId,
    productName,
  });

  if (!customData?.content_ids?.length) {
    await releaseFunnelMetaDispatchClaim(supabase, eventId);
    console.warn("[meta] InitiateCheckout CAPI skipped: unresolved content_ids", {
      eventIdPrefix: eventId.slice(0, 12),
      productId,
    });
    const result = { sent: false, skipped: true, reason: "missing_content_ids" } as const;
    recordInitiateCheckoutOutcome(supabase, { eventId, productId, result });
    return result;
  }

  const headers = input.requestHeaders ?? new Headers();
  const clientIp = resolveClientIpAddress(headers);
  const clientUa = headers.get("user-agent")?.trim() || null;
  const eventSourceUrl =
    input.eventSourceUrl?.trim() ||
    buildPublicProductUrl((product.slug as string | null) ?? "") ||
    null;

  try {
    const capi = await sendMetaEvent({
      pixelId,
      eventName: "InitiateCheckout",
      eventId,
      eventSourceUrl,
      requestHeaders: headers,
      eventTimeSec: input.eventTimeSec,
      userData: {
        fbp: input.metaFbp?.trim() || null,
        fbc: input.metaFbc?.trim() || null,
        clientIpAddress: clientIp,
        clientUserAgent: clientUa,
      },
      customData,
    });

    if (!capi.ok) {
      await releaseFunnelMetaDispatchClaim(supabase, eventId);
      console.warn("[meta] InitiateCheckout CAPI dispatch failed", {
        eventIdPrefix: eventId.slice(0, 12),
        reason: capi.reason,
      });
      const result = { sent: false, reason: capi.reason ?? "capi_failed" } as const;
      recordInitiateCheckoutOutcome(supabase, {
        eventId,
        productId,
        result,
        detail: capi.detail,
      });
      return result;
    }

    recordInitiateCheckoutOutcome(supabase, {
      eventId,
      productId,
      result: { sent: true },
      detail: capi.detail,
    });
    return { sent: true };
  } catch (e) {
    await releaseFunnelMetaDispatchClaim(supabase, eventId);
    throw e;
  }
}
