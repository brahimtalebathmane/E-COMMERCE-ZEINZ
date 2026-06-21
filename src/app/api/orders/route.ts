import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { signOrderActionToken } from "@/lib/auth/order-action-token";
import { apiErrorResponse, apiValidationError } from "@/lib/api/errors";
import { mapLeadDispatchToApiPayload, metaLeadDiagnostics } from "@/lib/meta/api-payload";
import { dispatchMetaEvent } from "@/lib/meta/dispatch";
import { logOrderCommunicationEvent } from "@/lib/order-communication-log";
import {
  notifyAdminsOfNewOrder,
  resolveOrderProductName,
} from "@/lib/onesignal/post-order-notify";
import { resolveServerMetaPixelId } from "@/lib/meta-pixel-id";
import { canAcceptStoreOrder } from "@/lib/product-test-status";
import { createMetaEventId, resolveClientIpAddress } from "@/utils/meta";
import type { ProductTestingStatus } from "@/types";
import { createOrderPhoneSchema } from "@/lib/validation/phone";

const createOrderSchema = z.object({
  product_id: z.string().uuid("product_id required"),
  customer_name: z.string().trim().min(1, "customer_name required"),
  phone: createOrderPhoneSchema,
  meta_event_id: z.string().trim().optional(),
  event_source_url: z.string().trim().optional(),
  meta_fbp: z.string().trim().optional(),
  meta_fbc: z.string().trim().optional(),
});

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiValidationError("Invalid JSON");
  }

  const parsed = createOrderSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Invalid request";
    return apiValidationError(first);
  }

  const data = parsed.data;

  try {
    const supabase = createServiceClient();

    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("id, discount_price, price, meta_pixel_id, test_status, name_ar, name_fr")
      .eq("id", data.product_id)
      .maybeSingle();

    if (pErr) {
      throw new Error(pErr.message);
    }
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    const testStatus = product.test_status as ProductTestingStatus;
    if (!canAcceptStoreOrder(testStatus)) {
      return NextResponse.json({ error: "Product not available for orders" }, { status: 403 });
    }

    const total =
      product.discount_price != null
        ? Number(product.discount_price)
        : Number(product.price);

    const orderEventId =
      data.meta_event_id && data.meta_event_id.length > 0
        ? data.meta_event_id
        : createMetaEventId();
    const orderPixelId = resolveServerMetaPixelId(product.meta_pixel_id);
    const eventSourceUrl = data.event_source_url?.length ? data.event_source_url : null;
    const metaFbp = data.meta_fbp?.length ? data.meta_fbp : null;
    const metaFbc = data.meta_fbc?.length ? data.meta_fbc : null;
    const metaClientIp = resolveClientIpAddress(request.headers);
    const metaClientUa = request.headers.get("user-agent")?.trim() || null;

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        product_id: data.product_id,
        customer_name: data.customer_name,
        phone: data.phone,
        payment_method: null,
        payment_number: null,
        transaction_reference: null,
        receipt_image_url: null,
        total_price: total,
        currency: "MRU",
        status: "pending",
        meta_event_id: orderEventId,
        meta_event_source_url: eventSourceUrl,
        meta_pixel_id: orderPixelId,
        meta_fbp: metaFbp,
        meta_fbc: metaFbc,
        meta_client_ip_address: metaClientIp,
        meta_client_user_agent: metaClientUa,
      })
      .select("id, total_price, meta_event_id, completion_token")
      .single();

    if (orderErr) {
      throw new Error(orderErr.message);
    }
    if (!order) {
      throw new Error("Create failed: no order returned");
    }

    console.warn("[POST /api/orders] Order created", {
      order_id: order.id,
      product_id: data.product_id,
    });

    await logOrderCommunicationEvent(supabase, order.id, "order_created", null);

    try {
      const oneSignalProductName = resolveOrderProductName(product);
      console.warn("[POST /api/orders] OneSignal dispatch begin", {
        order_id: order.id,
        product_name: oneSignalProductName,
      });
      // Awaited inline (not fire-and-forget) so the serverless runtime cannot garbage-collect
      // the request before OneSignal confirms a status — the result is logged before responding.
      const oneSignalResult = await notifyAdminsOfNewOrder({
        orderId: order.id,
        productName: oneSignalProductName,
      });
      console.warn("[POST /api/orders] OneSignal dispatch result", {
        order_id: order.id,
        result: oneSignalResult,
      });
      if (oneSignalResult.sent) {
        await logOrderCommunicationEvent(supabase, order.id, "onesignal_sent", null);
      } else if ("skipped" in oneSignalResult && oneSignalResult.skipped) {
        await logOrderCommunicationEvent(
          supabase,
          order.id,
          "onesignal_skipped",
          oneSignalResult.reason,
        );
      } else if ("error" in oneSignalResult) {
        await logOrderCommunicationEvent(
          supabase,
          order.id,
          "onesignal_failed",
          oneSignalResult.error,
        );
      }
    } catch (oneSignalErr) {
      console.error("[POST /api/orders] OneSignal notify threw", oneSignalErr);
    }

    let metaLead = mapLeadDispatchToApiPayload(null, "dispatch_not_run");
    try {
      const leadResult = await dispatchMetaEvent(supabase, order.id, "lead", {
        requestHeaders: request.headers,
      });
      metaLead = mapLeadDispatchToApiPayload(leadResult);
      console.warn("[POST /api/orders] Meta Lead CAPI", {
        order_id: order.id,
        lead: metaLead,
        diagnostics: metaLeadDiagnostics({
          productPixelId: product.meta_pixel_id as string | null,
          orderPixelId,
        }),
      });
    } catch (error) {
      metaLead = mapLeadDispatchToApiPayload(
        null,
        error instanceof Error ? error.message : String(error),
      );
    }

    const completionToken = String(order.completion_token);
    let actionToken: string;
    try {
      actionToken = signOrderActionToken(order.id, completionToken);
    } catch (tokenErr) {
      console.error("[POST /api/orders] ORDER_ACTION_SECRET missing", tokenErr);
      return apiErrorResponse(tokenErr, "[POST /api/orders] token");
    }

    return NextResponse.json({
      success: true,
      order_id: order.id,
      total_price: order.total_price,
      completion_token: completionToken,
      action_token: actionToken,
      meta: {
        lead: metaLead,
        diagnostics: metaLeadDiagnostics({
          productPixelId: product.meta_pixel_id as string | null,
          orderPixelId,
        }),
      },
    });
  } catch (e) {
    return apiErrorResponse(e, "[POST /api/orders]");
  }
}
