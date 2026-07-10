import type { MetaDispatchResult } from "@/lib/meta/dispatch";
import type { InitiateCheckoutDispatchResult } from "@/lib/meta/initiate-checkout-dispatch";

export type MetaLeadApiPayload =
  | { state: "sent" }
  | { state: "skipped"; reason: string }
  | { state: "failed"; reason: string }
  | { state: "error"; reason: string };

export function mapLeadDispatchToApiPayload(
  result: MetaDispatchResult | null,
  errorMessage?: string,
): MetaLeadApiPayload {
  if (errorMessage) {
    return { state: "error", reason: errorMessage };
  }
  if (!result) {
    return { state: "error", reason: "dispatch_not_run" };
  }
  if (result.sent) {
    return { state: "sent" };
  }
  if ("skipped" in result && result.skipped) {
    return { state: "skipped", reason: result.reason };
  }
  return {
    state: "failed",
    reason: "reason" in result ? result.reason : "capi_failed",
  };
}

export type MetaInitiateCheckoutApiPayload =
  | { state: "sent" }
  | { state: "skipped"; reason: string }
  | { state: "failed"; reason: string }
  | { state: "error"; reason: string };

export function mapInitiateCheckoutDispatchToApiPayload(
  result: InitiateCheckoutDispatchResult | null,
  errorMessage?: string,
): MetaInitiateCheckoutApiPayload {
  if (errorMessage) {
    return { state: "error", reason: errorMessage };
  }
  if (!result) {
    return { state: "error", reason: "dispatch_not_run" };
  }
  if (result.sent) {
    return { state: "sent" };
  }
  if ("skipped" in result && result.skipped) {
    return { state: "skipped", reason: result.reason };
  }
  return {
    state: "failed",
    reason: "reason" in result ? result.reason : "capi_failed",
  };
}

/** Safe diagnostics for API responses (no secrets). */
export function metaLeadDiagnostics(input: {
  productPixelId: string | null;
  orderPixelId: string | null;
}): {
  product_has_pixel_id: boolean;
  order_has_pixel_id: boolean;
  capi_token_configured: boolean;
} {
  return {
    product_has_pixel_id: Boolean(input.productPixelId?.trim()),
    order_has_pixel_id: Boolean(input.orderPixelId?.trim()),
    capi_token_configured: Boolean(process.env.META_CAPI_ACCESS_TOKEN?.trim()),
  };
}
