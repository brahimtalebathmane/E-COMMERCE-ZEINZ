import { NextResponse, after } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { signOrderActionToken } from "@/lib/auth/order-action-token";
import { apiErrorResponse, apiValidationError, apiRateLimitError, apiConflictError } from "@/lib/api/errors";
import { logOrderCommunicationEvent } from "@/lib/order-communication-log";
import {
  DUPLICATE_ORDER_ERROR_AR,
  hasRecentDuplicateOrder,
} from "@/lib/orders/duplicate-guard";
import { checkOrderCreateRateLimit } from "@/lib/rate-limit/order-create";
import {
  notifyAdminsOfNewOrder,
  resolveOrderProductName,
} from "@/lib/onesignal/post-order-notify";
import { resolveServerMetaPixelId, resolveCountryPixelIds } from "@/lib/meta-pixel-id";
import { canAcceptStoreOrder } from "@/lib/product-test-status";
import { createMetaEventId, resolveClientIpAddress } from "@/utils/meta";
import type { ProductTestingStatus } from "@/types";
import { createStorefrontPhoneSchema } from "@/lib/validation/phone";
import { setOrderSuccessSessionCookies } from "@/lib/orders/order-success-session";
import { appendAffiliateOrderRow } from "@/lib/google-sheets/affiliate-order-sheet";

const createOrderSchema = z.object({
  product_id: z.string().uuid("product_id required"),
  customer_name: z.string().trim().min(1, "customer_name required"),
  phone: createStorefrontPhoneSchema,
  meta_event_id: z.string().trim().optional(),
  event_source_url: z.string().trim().optional(),
  meta_fbp: z.string().trim().optional(),
  meta_fbc: z.string().trim().optional(),
  // Affiliate-only fields (validated against the product's fulfillment_type below).
  affiliate_address: z.string().trim().optional(),
  affiliate_city: z.string().trim().optional(),
  affiliate_country: z.string().trim().optional(),
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
    const metaClientIp = resolveClientIpAddress(request.headers);

    const rateLimit = await checkOrderCreateRateLimit(supabase, metaClientIp);
    if (!rateLimit.allowed) {
      console.warn("[POST /api/orders] Rate limit exceeded", {
        ip: metaClientIp,
        retry_after_sec: rateLimit.retryAfterSec,
      });
      return apiRateLimitError(rateLimit.retryAfterSec);
    }

    const isDuplicate = await hasRecentDuplicateOrder(supabase, {
      phone: data.phone,
      productId: data.product_id,
    });
    if (isDuplicate) {
      console.warn("[POST /api/orders] Duplicate order rejected", {
        phone: data.phone,
        product_id: data.product_id,
      });
      return apiConflictError(DUPLICATE_ORDER_ERROR_AR);
    }

    const { data: product, error: pErr } = await supabase
      .from("products")
      .select(
        "id, discount_price, price, test_status, name_ar, name_fr, deleted_at, fulfillment_type, affiliate_sku, affiliate_currency, affiliate_sheet_url, country_id",
      )
      .eq("id", data.product_id)
      .maybeSingle();

    if (pErr) {
      throw new Error(pErr.message);
    }
    if (!product || product.deleted_at != null) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    const testStatus = product.test_status as ProductTestingStatus;
    if (!canAcceptStoreOrder(testStatus)) {
      return NextResponse.json({ error: "Product not available for orders" }, { status: 403 });
    }

    const isAffiliate = product.fulfillment_type === "affiliate";
    if (isAffiliate) {
      if (!data.affiliate_address || !data.affiliate_city || !data.affiliate_country) {
        return apiValidationError("Address, city and country are required.");
      }
    }

    // Single lookup, reused for the order's currency AND (below) the
    // OneSignal country tag — sourced from countries.currency (canonical),
    // not the legacy products.affiliate_currency free-text field, which can
    // hold non-ISO values (e.g. an Arabic currency name entered by hand).
    const { data: orderCountry } = product.country_id
      ? await supabase
          .from("countries")
          .select("name_ar, currency")
          .eq("id", product.country_id as string)
          .maybeSingle()
      : { data: null };

    if (isAffiliate && !orderCountry?.currency) {
      console.error("[POST /api/orders] Affiliate product missing a resolvable country currency", {
        product_id: product.id,
        country_id: product.country_id,
      });
      return apiErrorResponse(
        new Error("Affiliate product is misconfigured (missing currency)"),
        "[POST /api/orders]",
      );
    }
    const orderCurrency = isAffiliate ? String(orderCountry?.currency) : "MRU";

    const total =
      product.discount_price != null
        ? Number(product.discount_price)
        : Number(product.price);

    const orderEventId =
      data.meta_event_id && data.meta_event_id.length > 0
        ? data.meta_event_id
        : createMetaEventId();
    const countryPixelIds = await resolveCountryPixelIds(supabase, product.country_id as string | null);
    const orderPixelId = resolveServerMetaPixelId(countryPixelIds.server);
    const eventSourceUrl = data.event_source_url?.length ? data.event_source_url : null;
    const metaFbp = data.meta_fbp?.length ? data.meta_fbp : null;
    const metaFbc = data.meta_fbc?.length ? data.meta_fbc : null;
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
        currency: orderCurrency,
        status: "pending",
        meta_event_id: orderEventId,
        meta_event_source_url: eventSourceUrl,
        /** Snapshot of the pixel actually resolved (country override or env fallback) for admin display; not read back for routing. */
        meta_pixel_id: orderPixelId,
        meta_fbp: metaFbp,
        meta_fbc: metaFbc,
        meta_client_ip_address: metaClientIp,
        meta_client_user_agent: metaClientUa,
        affiliate_address: isAffiliate ? data.affiliate_address : null,
        affiliate_city: isAffiliate ? data.affiliate_city : null,
        affiliate_country: isAffiliate ? data.affiliate_country : null,
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

    if (isAffiliate) {
      // Sheet write is best-effort: COD Partner reads from the sheet, but the
      // order is already safely in our DB either way. Failure never fails the
      // request — it's logged so the admin can retry from the orders view.
      // Deferred via after() so the customer's response isn't held up by the
      // Google Sheets round-trip (routinely 1-3+ seconds) — Netlify's Next.js
      // Runtime keeps the function alive for this via waitUntil, confirmed
      // against their current docs ("next/after" — Full Support).
      after(async () => {
        try {
          if (!product.affiliate_sheet_url) {
            throw new Error("Product has no affiliate_sheet_url configured");
          }
          await appendAffiliateOrderRow(product.affiliate_sheet_url, {
            orderDate: new Date().toISOString(),
            orderId: order.id,
            fullName: data.customer_name,
            phone: data.phone,
            country: data.affiliate_country ?? "",
            city: data.affiliate_city ?? "",
            fullAddress: data.affiliate_address ?? "",
            sku: product.affiliate_sku ?? "",
            quantity: 1,
            total: Number(order.total_price),
            currency: orderCurrency,
            note: "",
          });
          await logOrderCommunicationEvent(supabase, order.id, "affiliate_sheet_write_succeeded", null);
        } catch (sheetErr) {
          const message = sheetErr instanceof Error ? sheetErr.message : String(sheetErr);
          console.error("[POST /api/orders] Affiliate sheet write failed", {
            order_id: order.id,
            product_id: product.id,
            error: message,
          });
          await logOrderCommunicationEvent(supabase, order.id, "affiliate_sheet_write_failed", message);
        }
      });
    }

    const completionToken = String(order.completion_token);
    let actionToken: string;
    try {
      actionToken = signOrderActionToken(order.id, completionToken);
    } catch (tokenErr) {
      console.error("[POST /api/orders] ORDER_ACTION_SECRET missing", tokenErr);
      return apiErrorResponse(tokenErr, "[POST /api/orders] token");
    }

    try {
      const oneSignalProductName = resolveOrderProductName(product);
      console.warn("[POST /api/orders] OneSignal dispatch begin", {
        order_id: order.id,
        product_name: oneSignalProductName,
        country: orderCountry?.name_ar ?? null,
      });
      // Awaited inline (not fire-and-forget) so the serverless runtime cannot garbage-collect
      // the request before OneSignal confirms a status — the result is logged before responding.
      const oneSignalResult = await notifyAdminsOfNewOrder({
        orderId: order.id,
        productName: oneSignalProductName,
        countryNameAr: orderCountry?.name_ar ?? null,
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

    const response = NextResponse.json({
      success: true,
      order_id: order.id,
      meta_event_id: String(order.meta_event_id ?? orderEventId),
      total_price: order.total_price,
      completion_token: completionToken,
      action_token: actionToken,
    });

    setOrderSuccessSessionCookies(response, {
      orderId: order.id,
      completionToken,
      actionToken,
    });

    return response;
  } catch (e) {
    return apiErrorResponse(e, "[POST /api/orders]");
  }
}
