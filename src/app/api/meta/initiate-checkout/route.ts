import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { apiErrorResponse, apiRateLimitError, apiValidationError } from "@/lib/api/errors";
import { mapInitiateCheckoutDispatchToApiPayload } from "@/lib/meta/api-payload";
import { dispatchInitiateCheckoutMetaEvent } from "@/lib/meta/initiate-checkout-dispatch";
import { checkOrderCreateRateLimit } from "@/lib/rate-limit/order-create";
import { resolveClientIpAddress } from "@/utils/meta";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  product_id: z.string().uuid(),
  event_id: z.string().trim().min(1),
  event_time: z.number().int().positive().optional(),
  /** Same field Lead uses — resolved via resolveEventSourceUrl(stored, headers) in sendMetaEvent. */
  event_source_url: z.string().trim().optional(),
  meta_fbp: z.string().trim().optional(),
  meta_fbc: z.string().trim().optional(),
});

/**
 * Browser-paired InitiateCheckout CAPI — same funnel event_id as Pixel InitiateCheckout.
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
    return apiValidationError("product_id and event_id required");
  }

  const clientIp = resolveClientIpAddress(request.headers);
  try {
    const supabase = createServiceClient();
    const rateLimit = await checkOrderCreateRateLimit(supabase, clientIp);
    if (!rateLimit.allowed) {
      return apiRateLimitError(rateLimit.retryAfterSec);
    }

    const result = await dispatchInitiateCheckoutMetaEvent(supabase, {
      productId: parsed.data.product_id,
      eventId: parsed.data.event_id,
      eventSourceUrl: parsed.data.event_source_url?.length
        ? parsed.data.event_source_url
        : null,
      eventTimeSec: parsed.data.event_time,
      requestHeaders: request.headers,
      metaFbp: parsed.data.meta_fbp?.length ? parsed.data.meta_fbp : null,
      metaFbc: parsed.data.meta_fbc?.length ? parsed.data.meta_fbc : null,
    });

    const initiateCheckout = mapInitiateCheckoutDispatchToApiPayload(result);
    console.warn("[POST /api/meta/initiate-checkout] Meta InitiateCheckout CAPI", {
      product_id: parsed.data.product_id,
      event_id_prefix: parsed.data.event_id.slice(0, 12),
      initiateCheckout,
    });

    return NextResponse.json({ initiate_checkout: initiateCheckout });
  } catch (e) {
    return apiErrorResponse(e, "[POST /api/meta/initiate-checkout]");
  }
}
