import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { FORBIDDEN_RESPONSE, apiErrorResponse, apiValidationError } from "@/lib/api/errors";
import { mapLeadDispatchToApiPayload } from "@/lib/meta/api-payload";
import { dispatchMetaEvent } from "@/lib/meta/dispatch";
import { readVerifiedOrderSuccessSession } from "@/lib/orders/order-success-session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  order_id: z.string().uuid(),
});

/**
 * Shopper Lead CAPI — authenticated via HttpOnly order-success session cookies
 * (same session as WhatsApp). Called from order-success alongside the browser pixel.
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
  const session = await readVerifiedOrderSuccessSession(orderId);
  if (!session.ok) {
    console.warn("[POST /api/orders/meta/lead] Forbidden", {
      order_id: orderId,
      reason: session.reason,
    });
    return FORBIDDEN_RESPONSE;
  }

  try {
    const supabase = createServiceClient();
    const referer = request.headers.get("referer")?.trim();
    if (referer) {
      await supabase
        .from("orders")
        .update({ meta_event_source_url: referer })
        .eq("id", orderId)
        .is("deleted_at", null);
    }

    const result = await dispatchMetaEvent(supabase, orderId, "lead", {
      requestHeaders: request.headers,
    });
    const lead = mapLeadDispatchToApiPayload(result);
    const testEventCode = process.env.META_CAPI_TEST_EVENT_CODE?.trim() || "";
    const { data: orderMeta } = await supabase
      .from("orders")
      .select("meta_event_id, meta_pixel_id")
      .eq("id", orderId)
      .maybeSingle();
    const capiEventId = orderMeta?.meta_event_id?.trim() || "";
    const capiPixelId = orderMeta?.meta_pixel_id?.trim() || "";
    const diagnostics = {
      test_event_code_included: testEventCode.length > 0,
      test_event_code_prefix: testEventCode ? testEventCode.slice(0, 8) : null,
      capi_event_id_prefix: capiEventId ? capiEventId.slice(0, 20) : null,
      capi_pixel_id_prefix: capiPixelId ? capiPixelId.slice(0, 8) : null,
    };
    // #region agent log
    console.warn("[POST /api/orders/meta/lead][debug] dispatch result", {
      hypothesisId: "H1-H3",
      order_id: orderId,
      lead,
      diagnostics,
    });
    fetch("http://127.0.0.1:7481/ingest/e5ab9c4f-3cf6-4050-b164-44ac5ad50fe7", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "5d3a9b" },
      body: JSON.stringify({
        sessionId: "5d3a9b",
        runId: "pre-fix",
        hypothesisId: "H1-H3",
        location: "orders/meta/lead/route.ts",
        message: "Lead CAPI dispatch result",
        data: { order_id: orderId, lead_state: lead.state, diagnostics },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    console.warn("[POST /api/orders/meta/lead] Meta Lead CAPI", {
      order_id: orderId,
      lead,
      diagnostics,
    });
    return NextResponse.json({ lead, diagnostics });
  } catch (e) {
    return apiErrorResponse(e, "[POST /api/orders/meta/lead]");
  }
}
