"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { assertAdminUser, assertPermission, AuthError } from "@/lib/auth/admin";
import { canEditOrderDetails, PERMISSIONS, permissionForOrderStatus } from "@/lib/auth/permissions";
import { getCountryScope } from "@/lib/auth/country-scope";
import { createServiceClient } from "@/lib/supabase/service";
import { updateOrderStatusWithEffects, type MetaSideEffect } from "@/lib/orders/update-status";
import { createOrderPhoneSchema } from "@/lib/validation/phone";
import { logOrderCommunicationEvent } from "@/lib/order-communication-log";
import { sanitizePhoneForMetaE164 } from "@/lib/meta-user-data";
import type { OrderStatus } from "@/types";

/** Soft-delete: hides the order from admin UI while preserving audit data. */
export async function deleteOrderAction(id: string) {
  await deleteOrdersAction([id]);
}

/** Soft-delete multiple orders in one round-trip. */
export async function deleteOrdersAction(ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  await assertPermission(PERMISSIONS.cancel_orders);

  // Service role bypasses RLS after the permission gate above — same pattern as
  // PATCH /api/orders/[id] status updates. The user-scoped client cannot soft-
  // delete because orders_update_admin WITH CHECK rejects rows once deleted_at
  // is set (037 regression until migration 040 is applied).
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("orders")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", uniqueIds)
    .is("deleted_at", null)
    .select("id");

  if (error) throw new Error(error.message);
  if ((data?.length ?? 0) !== uniqueIds.length) {
    throw new Error("Some orders could not be deleted");
  }
  revalidatePath("/admin/orders");
}

export type DeliveryCostActionResult =
  | { ok: true; amount: number | null }
  | { ok: false; error: string };

/** Per-order delivery cost, editable from the order detail view (feeds profit analytics). */
export async function updateOrderDeliveryCostAction(
  orderId: string,
  amount: number | null,
): Promise<DeliveryCostActionResult> {
  const id = orderId?.trim();
  if (!id) {
    return { ok: false, error: "order id is required." };
  }
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    return { ok: false, error: "Delivery cost must be a number greater than or equal to zero." };
  }

  const rounded = amount === null ? null : Math.round(amount * 100) / 100;

  try {
    const session = await assertAdminUser();
    if (!canEditOrderDetails(session.access)) {
      throw new AuthError(403, "Forbidden");
    }

    const supabase = createServiceClient();
    const { error } = await supabase
      .from("orders")
      .update({ delivery_cost: rounded })
      .eq("id", id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/admin/orders");
    revalidatePath("/admin/analytics");
    return { ok: true, amount: rounded };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to save delivery cost.",
    };
  }
}

export type NoteActionResult = { ok: true; note: string | null } | { ok: false; error: string };

/** Free-text admin note, editable directly from the order row/card and the detail modal. */
export async function updateOrderNoteAction(
  orderId: string,
  note: string | null,
): Promise<NoteActionResult> {
  const id = orderId?.trim();
  if (!id) {
    return { ok: false, error: "order id is required." };
  }

  const trimmed = note?.trim() ?? "";
  const value = trimmed === "" ? null : trimmed;

  try {
    const session = await assertAdminUser();
    if (!canEditOrderDetails(session.access)) {
      throw new AuthError(403, "Forbidden");
    }

    const supabase = createServiceClient();
    const { error } = await supabase.from("orders").update({ note: value }).eq("id", id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/admin/orders");
    return { ok: true, note: value };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to save note.",
    };
  }
}

export type BulkStatusActionResult =
  | { ok: true; succeededIds: string[]; failedIds: string[] }
  | { ok: false; error: string };

/**
 * Bulk status change for selected orders. Loops `updateOrderStatusWithEffects`
 * per order (not a raw bulk SQL UPDATE) so each order still gets state-machine
 * validation, `order_status_history` logging, and the Meta Purchase/
 * CancelledLead CAPI dispatch it would get from a single-order change —
 * skipping that per-order logic would silently break Meta tracking parity.
 * Returns per-order results (not just counts) so the client can patch exactly
 * the orders that actually changed rather than guessing.
 */
export async function updateOrdersStatusBulkAction(
  orderIds: string[],
  nextStatus: OrderStatus,
): Promise<BulkStatusActionResult> {
  const uniqueIds = [...new Set(orderIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { ok: false, error: "No orders selected." };
  }

  try {
    const requiredPermission = permissionForOrderStatus(nextStatus);
    if (!requiredPermission) {
      return { ok: false, error: "Invalid status." };
    }
    const session = await assertPermission(requiredPermission);
    const requestHeaders = await headers();
    const supabase = createServiceClient();

    const succeededIds: string[] = [];
    const failedIds: string[] = [];
    for (const orderId of uniqueIds) {
      const result = await updateOrderStatusWithEffects(supabase, orderId, nextStatus, {
        requestHeaders,
        changedBy: session.access.userId,
      });
      if (result.ok) succeededIds.push(orderId);
      else failedIds.push(orderId);
    }

    revalidatePath("/admin/orders");
    return { ok: true, succeededIds, failedIds };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to update status.",
    };
  }
}

export type QuantityActionResult =
  | { ok: true; quantity: number; totalPrice: number }
  | { ok: false; error: string };

/**
 * Per-order quantity, editable from the order detail view. Recomputes
 * `total_price` from the order's OWN historical unit price (total_price /
 * current quantity), not the product's current catalog price — so editing an
 * old order's quantity never silently re-prices it against a since-changed
 * product price.
 */
export async function updateOrderQuantityAction(
  orderId: string,
  quantity: number,
): Promise<QuantityActionResult> {
  const id = orderId?.trim();
  if (!id) {
    return { ok: false, error: "order id is required." };
  }
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, error: "الكمية يجب أن تكون رقماً صحيحاً 1 أو أكثر." };
  }

  try {
    const session = await assertAdminUser();
    if (!canEditOrderDetails(session.access)) {
      throw new AuthError(403, "Forbidden");
    }

    const supabase = createServiceClient();
    const { data: existing, error: fetchErr } = await supabase
      .from("orders")
      .select("total_price, quantity")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) {
      return { ok: false, error: fetchErr.message };
    }
    if (!existing) {
      return { ok: false, error: "Order not found" };
    }

    const currentQuantity = Number(existing.quantity) > 0 ? Number(existing.quantity) : 1;
    const unitPrice = Number(existing.total_price) / currentQuantity;
    const newTotal = Math.round(unitPrice * quantity * 100) / 100;

    const { error } = await supabase
      .from("orders")
      .update({ quantity, total_price: newTotal })
      .eq("id", id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/admin/orders");
    revalidatePath("/admin/analytics");
    return { ok: true, quantity, totalPrice: newTotal };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to save quantity.",
    };
  }
}

export type ManualSaleProductOption = {
  id: string;
  name: string;
  price: number;
  discountPrice: number | null;
  /** All products here belong to the same (currently selected) country, so this is one shared currency. */
  currency: string;
};

/**
 * Active (non-archived) products for the manual-sale product picker,
 * scoped to the currently-selected country — this also guarantees every
 * option shares one currency, so the form's combined total is never a
 * meaningless sum across currencies.
 */
export async function listActiveProductsForManualSaleAction(): Promise<ManualSaleProductOption[]> {
  await assertPermission(PERMISSIONS.confirm_orders);
  const { selectedCountryId, selectedCountry } = await getCountryScope();
  const currency = selectedCountry?.currency ?? "MRU";
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name_ar, price, discount_price")
    .eq("country_id", selectedCountryId)
    .is("deleted_at", null)
    .order("name_ar", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name_ar,
    price: Number(p.price),
    discountPrice: p.discount_price == null ? null : Number(p.discount_price),
    currency,
  }));
}

export type ManualSaleLineInput = { productId: string; quantity: number };

export type ManualSaleChannel = "phone_call" | "other";

export type ManualSaleInput = {
  customerName: string;
  phone: string;
  initialStatus: Extract<OrderStatus, "pending" | "confirmed">;
  /** How the sale happened — drives Meta CAPI `action_source` for the Purchase event. */
  channel: ManualSaleChannel;
  lines: ManualSaleLineInput[];
};

type ManualSaleMetaSignals = {
  meta_ctwa_clid: string | null;
  meta_fbp: string | null;
  meta_fbc: string | null;
};

const MANUAL_SALE_ATTRIBUTION_LOOKBACK_DAYS = 90;

/**
 * Best-effort attribution lookup for a manual sale, run before inserting the
 * order rows:
 *  1. the newest `whatsapp_ad_clicks` row for this phone within the lookback
 *     window — becomes `meta_ctwa_clid`, letting the eventual Purchase CAPI
 *     event route through Meta's business_messaging schema instead of an
 *     unattributed offline event.
 *  2. the newest `source = "storefront"` order for this phone within the
 *     lookback window — only its `meta_fbp`/`meta_fbc` are carried over, so a
 *     shopper who browsed the site before messaging still gets browser-side
 *     matching signals on their offline sale.
 *
 * Deliberately excludes meta_client_ip_address / meta_client_user_agent:
 * those describe one specific browsing session and would be wrong data to
 * attach to a later, unrelated offline sale (see orderCustomerSessionContext
 * in src/lib/meta/dispatch.ts).
 *
 * Never blocks recording the sale — any failure resolves to all-null signals.
 */
async function resolveManualSaleMetaSignals(
  supabase: ReturnType<typeof createServiceClient>,
  phone: string,
): Promise<ManualSaleMetaSignals> {
  const nullSignals: ManualSaleMetaSignals = {
    meta_ctwa_clid: null,
    meta_fbp: null,
    meta_fbc: null,
  };

  try {
    const sinceIso = new Date(
      Date.now() - MANUAL_SALE_ATTRIBUTION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    // whatsapp_ad_clicks.phone is E.164 digits with no "+" (sanitizePhoneForMetaE164
    // output); orders.phone is whatever the country picker produced (usually
    // "+222XXXXXXXX" here). Normalize before querying the former.
    const normalized = sanitizePhoneForMetaE164(phone);

    let ctwaClid: string | null = null;
    if (normalized) {
      const { data: adClick } = await supabase
        .from("whatsapp_ad_clicks")
        .select("ctwa_clid")
        .eq("phone", normalized)
        .gte("clicked_at", sinceIso)
        .order("clicked_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      ctwaClid = (adClick?.ctwa_clid as string | null) ?? null;
    }

    const phoneCandidates = normalized ? [phone, `+${normalized}`, normalized] : [phone];
    const { data: priorOrder } = await supabase
      .from("orders")
      .select("meta_fbp, meta_fbc")
      .in("phone", phoneCandidates)
      .eq("source", "storefront")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      meta_ctwa_clid: ctwaClid,
      meta_fbp: (priorOrder?.meta_fbp as string | null) ?? null,
      meta_fbc: (priorOrder?.meta_fbc as string | null) ?? null,
    };
  } catch {
    return nullSignals;
  }
}

export type ManualSaleLineResult = {
  id: string;
  productId: string;
  quantity: number;
  totalPrice: number;
  status: OrderStatus;
  metaPurchase?: MetaSideEffect;
};

export type ManualSaleResult =
  | { ok: true; orders: ManualSaleLineResult[] }
  | { ok: false; error: string };

/**
 * Records an in-person/phone sale from the admin panel. Creates one `orders`
 * row per product line (source="manual"), sharing a `manual_sale_group_id`
 * when there's more than one line so the admin UI can present them as a
 * single sale. Each row is otherwise a normal order — if `initialStatus` is
 * "confirmed", it's pushed through the exact same `updateOrderStatusWithEffects`
 * path a status-dropdown change uses, so the Meta Purchase CAPI dispatch and
 * `order_status_history` logging stay identical to an online order.
 */
export async function createManualSaleAction(
  input: ManualSaleInput,
): Promise<ManualSaleResult> {
  try {
    const session = await assertPermission(PERMISSIONS.confirm_orders);

    const customerName = input.customerName?.trim();
    if (!customerName) {
      return { ok: false, error: "اسم العميل مطلوب." };
    }

    const phoneParsed = createOrderPhoneSchema.safeParse(input.phone);
    if (!phoneParsed.success) {
      return {
        ok: false,
        error: phoneParsed.error.issues[0]?.message ?? "رقم الهاتف غير صالح.",
      };
    }
    const phone = phoneParsed.data;

    const channel: ManualSaleChannel = input.channel === "other" ? "other" : "phone_call";

    const lines = (input.lines ?? []).filter((line) => line.productId);
    if (lines.length === 0) {
      return { ok: false, error: "أضف منتجاً واحداً على الأقل." };
    }
    for (const line of lines) {
      if (!Number.isFinite(line.quantity) || !Number.isInteger(line.quantity) || line.quantity < 1) {
        return { ok: false, error: "الكمية يجب أن تكون رقماً صحيحاً 1 أو أكثر." };
      }
    }

    // Scoped to the currently-selected country — not just for consistency
    // with the picker, but so a tampered request can't slip in a product
    // from a different country (which would also carry the wrong currency).
    const { selectedCountryId, selectedCountry } = await getCountryScope();
    const currency = selectedCountry?.currency ?? "MRU";

    const supabase = createServiceClient();
    const productIds = [...new Set(lines.map((line) => line.productId))];
    const { data: products, error: productsErr } = await supabase
      .from("products")
      .select("id, price, discount_price")
      .in("id", productIds)
      .eq("country_id", selectedCountryId)
      .is("deleted_at", null);

    if (productsErr) {
      return { ok: false, error: productsErr.message };
    }

    const productMap = new Map((products ?? []).map((p) => [p.id, p]));
    for (const productId of productIds) {
      if (!productMap.has(productId)) {
        return { ok: false, error: "أحد المنتجات المختارة غير متاح." };
      }
    }

    const manualSaleGroupId = lines.length > 1 ? crypto.randomUUID() : null;
    const metaSignals = await resolveManualSaleMetaSignals(supabase, phone);
    const rowsToInsert = lines.map((line) => {
      const product = productMap.get(line.productId)!;
      const unitPrice = Number(product.discount_price ?? product.price);
      const totalPrice = Math.round(unitPrice * line.quantity * 100) / 100;
      return {
        product_id: line.productId,
        currency,
        customer_name: customerName,
        phone,
        total_price: totalPrice,
        quantity: line.quantity,
        status: "pending" as const,
        source: "manual" as const,
        manual_sale_group_id: manualSaleGroupId,
        manual_sale_channel: channel,
        ...metaSignals,
      };
    });

    const { data: inserted, error: insertErr } = await supabase
      .from("orders")
      .insert(rowsToInsert)
      .select("id, product_id, quantity, total_price, status");

    if (insertErr) {
      return { ok: false, error: insertErr.message };
    }
    if (!inserted || inserted.length === 0) {
      return { ok: false, error: "فشل إنشاء الطلب." };
    }

    const results: ManualSaleLineResult[] = inserted.map((row) => ({
      id: row.id,
      productId: row.product_id,
      quantity: row.quantity,
      totalPrice: Number(row.total_price),
      status: row.status as OrderStatus,
    }));

    if (input.initialStatus === "confirmed") {
      const requestHeaders = await headers();
      for (const result of results) {
        const changeResult = await updateOrderStatusWithEffects(
          supabase,
          result.id,
          "confirmed",
          { requestHeaders, changedBy: session.access.userId },
        );
        if (changeResult.ok) {
          result.status = changeResult.toStatus;
          result.metaPurchase = changeResult.metaPurchase;
        }
      }
    }

    revalidatePath("/admin/orders");
    revalidatePath("/admin/analytics");
    return { ok: true, orders: results };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to create manual sale.",
    };
  }
}

export type RetrySheetWriteResult = { ok: true } | { ok: false; error: string };

/**
 * Re-attempts the Google Sheet append for an affiliate order after a prior
 * failure (surfaced in the orders admin). Re-fetches the order and its
 * product fresh so a since-corrected affiliate_sheet_url is used.
 */
export async function retryAffiliateSheetWriteAction(
  orderId: string,
): Promise<RetrySheetWriteResult> {
  const id = orderId?.trim();
  if (!id) {
    return { ok: false, error: "order id is required." };
  }

  try {
    await assertPermission(PERMISSIONS.confirm_orders);
    const supabase = createServiceClient();

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select(
        "id, product_id, customer_name, phone, total_price, currency, quantity, affiliate_address, affiliate_city, affiliate_country",
      )
      .eq("id", id)
      .maybeSingle();
    if (orderErr) return { ok: false, error: orderErr.message };
    if (!order) return { ok: false, error: "Order not found" };

    const { data: product, error: productErr } = await supabase
      .from("products")
      .select("fulfillment_type, affiliate_sku, affiliate_sheet_url")
      .eq("id", order.product_id)
      .maybeSingle();
    if (productErr) return { ok: false, error: productErr.message };
    if (!product || product.fulfillment_type !== "affiliate") {
      return { ok: false, error: "This order is not an affiliate order." };
    }
    if (!product.affiliate_sheet_url) {
      return { ok: false, error: "Product has no affiliate_sheet_url configured." };
    }

    const { appendAffiliateOrderRow } = await import(
      "@/lib/google-sheets/affiliate-order-sheet"
    );

    try {
      await appendAffiliateOrderRow(product.affiliate_sheet_url, {
        orderDate: new Date().toISOString(),
        orderId: order.id,
        fullName: order.customer_name ?? "",
        phone: order.phone ?? "",
        country: order.affiliate_country ?? "",
        city: order.affiliate_city ?? "",
        fullAddress: order.affiliate_address ?? "",
        sku: product.affiliate_sku ?? "",
        quantity: order.quantity ?? 1,
        total: Number(order.total_price),
        currency: order.currency,
        note: "",
      });
      await logOrderCommunicationEvent(supabase, order.id, "affiliate_sheet_write_succeeded", null);
      revalidatePath("/admin/orders");
      return { ok: true };
    } catch (sheetErr) {
      const message = sheetErr instanceof Error ? sheetErr.message : String(sheetErr);
      await logOrderCommunicationEvent(supabase, order.id, "affiliate_sheet_write_failed", message);
      return { ok: false, error: message };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to retry sheet write.",
    };
  }
}

export type FinalizeAffiliateCostsResult =
  | { ok: true; otherCosts: number }
  | { ok: false; error: string };

/**
 * Set-price affiliate orders stay excluded from profit totals until the
 * admin enters COD Partner's reported other_costs and finalizes here, even
 * if the order is already shipped (see buildProductProfitRows).
 */
export async function finalizeAffiliateCostsAction(
  orderId: string,
  otherCosts: number,
): Promise<FinalizeAffiliateCostsResult> {
  const id = orderId?.trim();
  if (!id) {
    return { ok: false, error: "order id is required." };
  }
  if (!Number.isFinite(otherCosts) || otherCosts < 0) {
    return { ok: false, error: "Other costs must be a number greater than or equal to zero." };
  }

  try {
    const session = await assertAdminUser();
    if (!canEditOrderDetails(session.access)) {
      throw new AuthError(403, "Forbidden");
    }

    const rounded = Math.round(otherCosts * 100) / 100;
    const supabase = createServiceClient();
    const { error } = await supabase
      .from("orders")
      .update({ affiliate_other_costs: rounded, affiliate_costs_finalized: true })
      .eq("id", id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/admin/orders");
    revalidatePath("/admin/analytics");
    return { ok: true, otherCosts: rounded };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to finalize affiliate costs.",
    };
  }
}
