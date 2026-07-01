import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { FORBIDDEN_RESPONSE, apiErrorResponse, apiValidationError } from "@/lib/api/errors";
import { mapLeadDispatchToApiPayload } from "@/lib/meta/api-payload";
import { dispatchMetaEvent } from "@/lib/meta/dispatch";
import { resolveLeadEventId } from "@/lib/meta-lead-event-id";
import { verifyShopperOrderSuccessAccess } from "@/lib/orders/order-success-auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  order_id: z.string().uuid(),
  completion_token: z.string().uuid().optional(),
  action_token: z.string().min(1).optional(),
  event_time: z.number().int().positive().optional(),
  event_id: z.string().trim().min(1).optional(),
});

/**
 * Shopper Lead CAPI — authenticated via order action tokens (same as WhatsApp)
 * or HttpOnly order-success session cookies. Called from order-success alongside the browser pixel.
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
    return apiValidationError("order_id required");
  }

  const orderId = parsed.data.order_id.trim();
  const access = await verifyShopperOrderSuccessAccess({
    orderId,
    completionToken: parsed.data.completion_token,
    actionToken: parsed.data.action_token,
  });
  if (!access.ok) {
    console.warn("[POST /api/orders/meta/lead] Forbidden", {
      order_id: orderId,
      reason: access.reason,
    });
    return FORBIDDEN_RESPONSE;
  }

  try {
    const supabase = createServiceClient();

    const { data: orderRow } = await supabase
      .from("orders")
      .select("meta_event_id")
      .eq("id", orderId)
      .maybeSingle();

    const canonicalEventId = resolveLeadEventId({
      orderId,
      metaEventId: orderRow?.meta_event_id as string | null,
    });
    const clientEventId = parsed.data.event_id?.trim();
    if (clientEventId && clientEventId !== canonicalEventId) {
      console.warn("[POST /api/orders/meta/lead] event_id mismatch (using order row)", {
        order_id: orderId,
        client_event_id: clientEventId,
        canonical_event_id: canonicalEventId,
      });
    }

    const result = await dispatchMetaEvent(supabase, orderId, "lead", {
      requestHeaders: request.headers,
      eventTimeSec: parsed.data.event_time,
    });
    const lead = mapLeadDispatchToApiPayload(result);
    console.warn("[POST /api/orders/meta/lead] Meta Lead CAPI", {
      order_id: orderId,
      via: access.via,
      event_id: canonicalEventId,
      lead,
    });
    return NextResponse.json({ lead });
  } catch (e) {
    return apiErrorResponse(e, "[POST /api/orders/meta/lead]");
  }
}
