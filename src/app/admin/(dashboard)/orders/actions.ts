"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { assertAdminUser, assertPermission, AuthError } from "@/lib/auth/admin";
import { canEditOrderDetails, PERMISSIONS, permissionForOrderStatus } from "@/lib/auth/permissions";
import { createServiceClient } from "@/lib/supabase/service";
import { updateOrderStatusWithEffects, type MetaSideEffect } from "@/lib/orders/update-status";
import { createOrderPhoneSchema } from "@/lib/validation/phone";
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
};

/** Active (non-archived) products for the manual-sale product picker. */
export async function listActiveProductsForManualSaleAction(): Promise<ManualSaleProductOption[]> {
  await assertPermission(PERMISSIONS.confirm_orders);
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name_ar, price, discount_price")
    .is("deleted_at", null)
    .order("name_ar", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name_ar,
    price: Number(p.price),
    discountPrice: p.discount_price == null ? null : Number(p.discount_price),
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

    const supabase = createServiceClient();
    const productIds = [...new Set(lines.map((line) => line.productId))];
    const { data: products, error: productsErr } = await supabase
      .from("products")
      .select("id, price, discount_price")
      .in("id", productIds)
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
    const rowsToInsert = lines.map((line) => {
      const product = productMap.get(line.productId)!;
      const unitPrice = Number(product.discount_price ?? product.price);
      const totalPrice = Math.round(unitPrice * line.quantity * 100) / 100;
      return {
        product_id: line.productId,
        customer_name: customerName,
        phone,
        total_price: totalPrice,
        quantity: line.quantity,
        status: "pending" as const,
        source: "manual" as const,
        manual_sale_group_id: manualSaleGroupId,
        manual_sale_channel: channel,
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
