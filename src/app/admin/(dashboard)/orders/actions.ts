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
import { dayKey } from "@/lib/analytics/daily-profit";
import { isValidOrderDateKey, resolveOrderedAtIso } from "@/lib/orders/ordered-at";
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
  revalidatePath("/admin/orders/deleted");
}

/**
 * Undo a soft delete. Service role for the same reason deleteOrdersAction uses
 * it: orders_select_admin/orders_update_admin filter on deleted_at, so a
 * user-scoped client cannot even see the row it needs to restore.
 *
 * Restoring never re-fires a Meta event: it only clears `deleted_at`.
 * `meta_purchase_sent` and friends keep whatever value they had, so a restored
 * order that already sent its Purchase does not send a second one, and one
 * that never sent will be picked up by the normal dispatch path.
 */
export async function restoreOrdersAction(ids: string[]): Promise<void> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  await assertPermission(PERMISSIONS.cancel_orders);

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("orders")
    .update({ deleted_at: null })
    .in("id", uniqueIds)
    .not("deleted_at", "is", null)
    .select("id");

  if (error) throw new Error(error.message);
  if ((data?.length ?? 0) !== uniqueIds.length) {
    throw new Error("Some orders could not be restored");
  }
  revalidatePath("/admin/orders");
  revalidatePath("/admin/orders/deleted");
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

export type OrderDateActionResult =
  | { ok: true; orderedAt: string }
  | { ok: false; error: string };

/**
 * Business date of the sale, editable from the order detail view. Distinct
 * from created_at (the immutable row-insert timestamp used by Meta CAPI/
 * dispatch/audit logs, never touched here) — this only ever updates
 * orders.ordered_at, so it never re-fires or suppresses a Meta/WhatsApp/
 * affiliate-sheet side effect (same reasoning as updateOrderDeliveryCostAction).
 */
export async function updateOrderDateAction(
  orderId: string,
  dateKey: string,
): Promise<OrderDateActionResult> {
  const id = orderId?.trim();
  if (!id) {
    return { ok: false, error: "order id is required." };
  }

  const todayKey = dayKey(new Date());
  if (!isValidOrderDateKey(dateKey, todayKey)) {
    return { ok: false, error: "التاريخ غير صالح." };
  }
  const orderedAt = resolveOrderedAtIso(dateKey, todayKey);

  try {
    const session = await assertAdminUser();
    if (!canEditOrderDetails(session.access)) {
      throw new AuthError(403, "Forbidden");
    }

    const supabase = createServiceClient();
    const { data: existing, error: fetchErr } = await supabase
      .from("orders")
      .select("ordered_at")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) {
      return { ok: false, error: fetchErr.message };
    }
    if (!existing) {
      return { ok: false, error: "Order not found" };
    }

    const { error } = await supabase.from("orders").update({ ordered_at: orderedAt }).eq("id", id);

    if (error) {
      return { ok: false, error: error.message };
    }

    await logOrderCommunicationEvent(
      supabase,
      id,
      "order_date_changed",
      `${existing.ordered_at} -> ${orderedAt}`,
    );

    revalidatePath("/admin/orders");
    revalidatePath("/admin/analytics");
    return { ok: true, orderedAt };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to save order date.",
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

/** Browser cookies (fbp/fbc) stay useful for Meta's full 90-day window. */
const META_COOKIE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Meta's Click-to-WhatsApp attribution window. A click id older than this can
 * still be sent, but Meta will not credit the campaign for it — so the admin is
 * warned rather than the sale being silently mis-attributed.
 *
 * NOT exported: this is a "use server" module, where Next.js allows only async
 * functions as runtime exports. A plain `export const` here throws at module
 * evaluation and takes down every action in the file.
 */
const CTWA_ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type WhatsAppConversation = {
  /** E.164 digits, no "+" — the primary key of whatsapp_contacts. */
  phone: string;
  displayName: string | null;
  lastInboundAt: string;
  inboundCount: number;
  adSourceId: string | null;
  adClickedAt: string | null;
  /** False when an ad click exists but has aged past Meta's 7-day window. */
  adAttributable: boolean;
};

/**
 * Strips everything PostgREST's `or()` mini-language treats as syntax before a
 * user string is embedded in a filter. `or()` is parsed from a STRING, so a
 * comma, parenthesis or quote in the search box would otherwise change the
 * meaning of the filter rather than being matched literally. `%` and `_` are
 * `ilike` wildcards and are dropped for the same reason.
 */
function sanitizeContactSearch(raw: string): string {
  return raw
    .replace(/[,()"'%_\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/** Selected columns for a conversation row — one definition, two callers. */
const WHATSAPP_CONTACT_COLUMNS =
  "phone, display_name, last_inbound_at, inbound_count, last_ad_source_id, last_ad_clicked_at";

type WhatsAppContactRow = {
  phone: string;
  display_name: string | null;
  last_inbound_at: string;
  inbound_count: number | null;
  last_ad_source_id: string | null;
  last_ad_clicked_at: string | null;
};

function toConversation(row: WhatsAppContactRow, now: number): WhatsAppConversation {
  const adClickedAt = row.last_ad_clicked_at ?? null;
  const clickedMs = adClickedAt ? Date.parse(adClickedAt) : NaN;
  return {
    phone: row.phone,
    displayName: (row.display_name ?? "").trim() || null,
    lastInboundAt: row.last_inbound_at,
    inboundCount: Number(row.inbound_count) || 0,
    adSourceId: (row.last_ad_source_id ?? "").trim() || null,
    adClickedAt,
    adAttributable:
      Number.isFinite(clickedMs) && now - clickedMs <= CTWA_ATTRIBUTION_WINDOW_MS,
  };
}

/**
 * Conversations the admin can record a sale against, newest first.
 *
 * Sourced from `whatsapp_contacts`, which the WhatsApp worker writes on every
 * inbound message — so an organic chat with no ad behind it is listed too.
 *
 * `search` filters SERVER-side on purpose: the list is capped, so filtering the
 * already-loaded page would hide older conversations from the very search meant
 * to find them.
 */
export async function listWhatsAppConversationsAction(
  limit = 60,
  search?: string,
): Promise<WhatsAppConversation[]> {
  await assertPermission(PERMISSIONS.confirm_orders);

  const supabase = createServiceClient();
  let query = supabase
    .from("whatsapp_contacts")
    .select(WHATSAPP_CONTACT_COLUMNS)
    .order("last_inbound_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));

  const term = sanitizeContactSearch(search ?? "");
  if (term) {
    // Digits are matched anywhere in the stored E.164 form, so typing the local
    // 8-digit number finds the contact stored as 222XXXXXXXX. A term with any
    // non-digit is also matched against the WhatsApp profile name.
    const digits = term.replace(/\D/g, "");
    const filters: string[] = [];
    if (digits) filters.push(`phone.ilike.*${digits}*`);
    if (/\D/.test(term)) filters.push(`display_name.ilike.*${term}*`);
    if (filters.length > 0) query = query.or(filters.join(","));
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const now = Date.now();
  return ((data ?? []) as WhatsAppContactRow[]).map((row) => toConversation(row, now));
}

/**
 * One conversation by phone, for the manual-entry mode of the sale form.
 *
 * The admin types a number that may or may not have chatted with us. Returning
 * the same shape as the picker lets the form show the SAME attribution card, so
 * a typed number is never silently less attributed than a picked one — it either
 * resolves to a real conversation (and its ad click) or the form says plainly
 * that no conversation exists.
 */
export async function lookupWhatsAppContactAction(
  phone: string,
): Promise<WhatsAppConversation | null> {
  await assertPermission(PERMISSIONS.confirm_orders);

  const normalized = sanitizePhoneForMetaE164(phone ?? "");
  if (!normalized) return null;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("whatsapp_contacts")
    .select(WHATSAPP_CONTACT_COLUMNS)
    .eq("phone", normalized)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return toConversation(data as WhatsAppContactRow, Date.now());
}

/**
 * Meta signals for a sale recorded against a chosen WhatsApp conversation.
 *
 * The click id is read straight off the picked conversation — no phone lookup,
 * no window guessing. That removes the failure mode of the previous design,
 * which searched `whatsapp_ad_clicks` by phone over 90 days and could attach a
 * click far outside Meta's 7-day attribution window, or one belonging to a
 * different campaign entirely.
 *
 * `fbp`/`fbc` are still inherited from the same customer's most recent
 * storefront order: those cookies belong to the same person and stay useful for
 * 90 days, so reusing them is identity resolution, not fabrication. IP and
 * user-agent are deliberately NOT reused — they describe one specific browsing
 * session and would be wrong data on a later conversation sale.
 */
async function resolveWhatsAppSaleMetaSignals(
  supabase: ReturnType<typeof createServiceClient>,
  normalizedPhone: string,
  storedPhone: string,
): Promise<{
  meta_ctwa_clid: string | null;
  meta_ad_source_id: string | null;
  meta_fbp: string | null;
  meta_fbc: string | null;
}> {
  const empty = {
    meta_ctwa_clid: null,
    meta_ad_source_id: null,
    meta_fbp: null,
    meta_fbc: null,
  };

  try {
    const cookieSinceIso = new Date(Date.now() - META_COOKIE_WINDOW_MS).toISOString();

    const [contactResult, priorOrderResult] = await Promise.all([
      supabase
        .from("whatsapp_contacts")
        .select("last_ctwa_clid, last_ad_source_id")
        .eq("phone", normalizedPhone)
        .maybeSingle(),
      supabase
        .from("orders")
        .select("meta_fbp, meta_fbc")
        // orders.phone is stored as the country picker produced it (usually
        // "+222XXXXXXXX"), so match the plausible spellings rather than assuming
        // one. A miss just means no inherited cookies.
        .in("phone", [...new Set([storedPhone, `+${normalizedPhone}`, normalizedPhone])])
        .eq("source", "storefront")
        .gte("created_at", cookieSinceIso)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return {
      meta_ctwa_clid: (contactResult.data?.last_ctwa_clid as string | null)?.trim() || null,
      meta_ad_source_id:
        (contactResult.data?.last_ad_source_id as string | null)?.trim() || null,
      meta_fbp: (priorOrderResult.data?.meta_fbp as string | null)?.trim() || null,
      meta_fbc: (priorOrderResult.data?.meta_fbc as string | null)?.trim() || null,
    };
  } catch (error) {
    // Never block a sale on an attribution lookup.
    console.warn("[whatsapp-sale] Meta signal lookup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return empty;
  }
}

/**
 * Every admin-entered sale now comes from a WhatsApp conversation. "phone_call"
 * and "other" remain in the DB check constraint for historical rows only.
 */
export type ManualSaleChannel = "whatsapp";

export type WhatsAppSaleInput = {
  customerName: string;
  /** E.164 digits of the picked conversation (whatsapp_contacts.phone). */
  conversationPhone: string;
  initialStatus: Extract<OrderStatus, "pending" | "confirmed">;
  lines: ManualSaleLineInput[];
  /** Business date of the sale (YYYY-MM-DD, Africa/Nouakchott). Defaults to today in the form; editable for backdated sales. */
  orderDate: string;
};

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
 * Records a sale against a real WhatsApp conversation. Creates one `orders` row
 * per product line (source="manual", manual_sale_channel="whatsapp"), sharing a
 * `manual_sale_group_id` when there's more than one line so the admin UI can
 * present them as a single sale. Each row is otherwise a normal order — if
 * `initialStatus` is "confirmed", it goes through the exact same
 * `updateOrderStatusWithEffects` path a status-dropdown change uses, so the Meta
 * Purchase CAPI dispatch and `order_status_history` logging stay identical to an
 * online order.
 *
 * The phone is not typed by the admin: it comes from the picked conversation, so
 * the Click-to-WhatsApp click id binds deterministically instead of being
 * guessed from a phone-number search.
 */
export async function createWhatsAppSaleAction(
  input: WhatsAppSaleInput,
): Promise<ManualSaleResult> {
  try {
    const session = await assertPermission(PERMISSIONS.confirm_orders);

    const customerName = input.customerName?.trim();
    if (!customerName) {
      return { ok: false, error: "اسم العميل مطلوب." };
    }

    // The picker supplies E.164 digits straight from WhatsApp. Prefer the
    // Mauritania canonicalizer so the stored spelling matches existing orders;
    // fall back to "+digits" for a number it doesn't recognise rather than
    // rejecting a real conversation.
    const normalizedPhone = sanitizePhoneForMetaE164(input.conversationPhone ?? "");
    if (!normalizedPhone) {
      return { ok: false, error: "اختر محادثة واتساب صالحة." };
    }
    const canonical = createOrderPhoneSchema.safeParse(normalizedPhone);
    const phone = canonical.success ? canonical.data : `+${normalizedPhone}`;

    const channel: ManualSaleChannel = "whatsapp";

    const lines = (input.lines ?? []).filter((line) => line.productId);
    if (lines.length === 0) {
      return { ok: false, error: "أضف منتجاً واحداً على الأقل." };
    }
    for (const line of lines) {
      if (!Number.isFinite(line.quantity) || !Number.isInteger(line.quantity) || line.quantity < 1) {
        return { ok: false, error: "الكمية يجب أن تكون رقماً صحيحاً 1 أو أكثر." };
      }
    }

    const todayKey = dayKey(new Date());
    if (!isValidOrderDateKey(input.orderDate, todayKey)) {
      return { ok: false, error: "تاريخ الطلب غير صالح." };
    }
    const orderedAt = resolveOrderedAtIso(input.orderDate, todayKey);

    // Scoped to the currently-selected country — not just for consistency
    // with the picker, but so a tampered request can't slip in a product
    // from a different country (which would also carry the wrong currency).
    const { selectedCountryId, selectedCountry } = await getCountryScope();
    const currency = selectedCountry?.currency ?? "MRU";

    const supabase = createServiceClient();
    const productIds = [...new Set(lines.map((line) => line.productId))];
    const { data: products, error: productsErr } = await supabase
      .from("products")
      .select(
        "id, price, discount_price, cost_price, affiliate_commission_type, affiliate_fixed_commission, affiliate_sell_price",
      )
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
    const metaSignals = await resolveWhatsAppSaleMetaSignals(supabase, normalizedPhone, phone);
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
        ordered_at: orderedAt,
        unit_price: unitPrice,
        unit_cost_price: product.cost_price,
        affiliate_commission_type_at_order: product.affiliate_commission_type,
        affiliate_fixed_commission_at_order: product.affiliate_fixed_commission,
        affiliate_sell_price_at_order: product.affiliate_sell_price,
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
