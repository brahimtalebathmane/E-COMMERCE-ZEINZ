"use server";

import { revalidatePath } from "next/cache";
import { assertOwnerUser, AuthError } from "@/lib/auth/admin";
import { requireLocalOperationsScope } from "@/lib/auth/country-scope";
import { createServiceClient } from "@/lib/supabase/service";
import {
  sanitizeMovementPatch,
  sanitizeTransactionPatch,
  type MovementPatch,
  type TransactionPatch,
} from "@/lib/owner-edits/patch";

/**
 * Owner-only edits (migration 076). The owner role is checked here and again
 * in the database (owner_edit_begin), which also writes the audit log. Staff
 * never reach the functions: assertOwnerUser throws first.
 */

type Result = { ok: true } | { ok: false; error: string };

function ownerErrorMessage(raw: string): string {
  const map: Array<[string, string]> = [
    ["owner_only", "هذا الإجراء للمالك فقط."],
    ["edit a transfer as a whole", "التحويل يُعدَّل كاملاً (الطرفان معاً)."],
    ["amount cannot be 0", "المبلغ لا يمكن أن يكون 0 — احذف العملية بدلاً من ذلك."],
    ["quantity cannot be 0", "الكمية لا يمكن أن تكون 0 — احذف الحركة بدلاً من ذلك."],
    ["restore the", "استرجع السجل أولاً ثم عدّله."],
    ["must belong to the", "الحساب أو الفئة أو الطرف لا يتبع هذه الدولة."],
    ["treasury_transactions_reversal", "نوع «عكس» يحتاج عملية أصلية — اختر نوعاً آخر."],
    ["treasury_transactions_order_role_once", "يوجد قيد مبيعات آخر لنفس الطلب في نفس التسوية."],
    ["inventory_movements_order_primary_key", "يوجد قيد آخر لنفس الطلب والمنتج والنوع."],
    ["inventory_movements_opening_key", "يوجد رصيد افتتاحي آخر لهذا المنتج."],
    ["owned products", "المخزون يُتتبَّع للمنتجات المملوكة في موريتانيا فقط."],
    ["inventory_not_live", "أدخل الجرد الافتتاحي أولاً."],
    ["two different accounts", "اختر حسابين مختلفين."],
    ["must be positive", "المبلغ يجب أن يكون أكبر من 0."],
    ["unknown", "السجل غير موجود — حدّث الصفحة."],
  ];
  for (const [needle, message] of map) if (raw.includes(needle)) return message;
  return raw;
}

async function ownerContext() {
  const session = await assertOwnerUser();
  await requireLocalOperationsScope();
  return { userId: session.access.userId, service: createServiceClient() };
}

async function run(fn: string, args: Record<string, unknown>, paths: string[]): Promise<Result> {
  try {
    const { userId, service } = await ownerContext();
    const { error } = await service.rpc(fn, { ...args, p_user: userId });
    if (error) return { ok: false, error: ownerErrorMessage(error.message) };
    for (const p of paths) revalidatePath(p, "layout");
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, error: ownerErrorMessage("owner_only") };
    return { ok: false, error: error instanceof Error ? ownerErrorMessage(error.message) : "تعذّر الحفظ." };
  }
}

const reasonArg = (reason?: string | null) => ({ p_reason: reason?.trim() || null });
const TREASURY = ["/admin/treasury", "/admin/analytics", "/admin"];
const INVENTORY = ["/admin/inventory", "/admin/treasury", "/admin"];

// === Treasury ===============================================================

export async function ownerUpdateTransactionAction(id: string, patch: TransactionPatch, reason?: string): Promise<Result> {
  const clean = sanitizeTransactionPatch(patch);
  if (!clean.ok) return { ok: false, error: clean.error };
  if (Object.keys(clean.patch).length === 0) return { ok: true };
  return run("owner_update_transaction", { p_id: id, p_patch: clean.patch, ...reasonArg(reason) }, TREASURY);
}

export async function ownerUpdateTransferAction(input: {
  groupId: string;
  amount: number;
  occurredOn: string;
  fromAccountId: string;
  toAccountId: string;
  note: string;
  reason?: string;
}): Promise<Result> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, error: "المبلغ يجب أن يكون أكبر من 0." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) return { ok: false, error: "التاريخ غير صالح." };
  return run(
    "owner_update_transfer",
    {
      p_group: input.groupId,
      p_amount: input.amount,
      p_occurred_on: input.occurredOn,
      p_from: input.fromAccountId,
      p_to: input.toAccountId,
      p_note: input.note,
      ...reasonArg(input.reason),
    },
    TREASURY,
  );
}

export async function ownerSetTransactionDeletedAction(id: string, deleted: boolean, reason?: string): Promise<Result> {
  return run("owner_set_transaction_deleted", { p_id: id, p_deleted: deleted, ...reasonArg(reason) }, TREASURY);
}

// === Inventory ==============================================================

export async function ownerUpdateMovementAction(id: string, patch: MovementPatch, reason?: string): Promise<Result> {
  const clean = sanitizeMovementPatch(patch);
  if (!clean.ok) return { ok: false, error: clean.error };
  if (Object.keys(clean.patch).length === 0) return { ok: true };
  return run("owner_update_movement", { p_id: id, p_patch: clean.patch, ...reasonArg(reason) }, INVENTORY);
}

export async function ownerSetMovementDeletedAction(id: string, deleted: boolean, reason?: string): Promise<Result> {
  return run("owner_set_movement_deleted", { p_id: id, p_deleted: deleted, ...reasonArg(reason) }, INVENTORY);
}

export async function ownerSetStockAction(productId: string, quantity: number, reason?: string): Promise<Result> {
  if (!Number.isInteger(quantity)) return { ok: false, error: "الكمية يجب أن تكون عدداً صحيحاً." };
  return run("owner_set_stock", { p_product_id: productId, p_quantity: quantity, ...reasonArg(reason) }, INVENTORY);
}

export async function ownerResetOrderStockAction(orderId: string, reason?: string): Promise<Result> {
  return run("owner_reset_order_stock", { p_order_id: orderId, ...reasonArg(reason) }, [...INVENTORY, "/admin/orders"]);
}

export async function ownerUpdateStockPurchaseAction(input: {
  purchaseId: string;
  supplier: string;
  purchasedOn: string;
  extraCosts: number;
  note: string;
  lines: { id?: string; productId: string; quantity: number; unitCost: number }[];
  reason?: string;
}): Promise<Result> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.purchasedOn)) return { ok: false, error: "التاريخ غير صالح." };
  if (!Number.isFinite(input.extraCosts) || input.extraCosts < 0) return { ok: false, error: "التكاليف الإضافية لا يمكن أن تكون سالبة." };
  if (input.lines.length === 0) return { ok: false, error: "أضف منتجاً واحداً على الأقل." };
  for (const l of input.lines) {
    if (!l.productId || !Number.isInteger(l.quantity) || l.quantity <= 0 || !Number.isFinite(l.unitCost) || l.unitCost < 0) {
      return { ok: false, error: "تحقق من المنتجات والكميات والأسعار." };
    }
  }
  return run(
    "owner_update_stock_purchase",
    {
      p_purchase_id: input.purchaseId,
      p_supplier: input.supplier,
      p_purchased_on: input.purchasedOn,
      p_extra_costs: input.extraCosts,
      p_note: input.note,
      p_lines: input.lines.map((l) => ({
        ...(l.id ? { id: l.id } : {}),
        product_id: l.productId,
        quantity: l.quantity,
        unit_cost: l.unitCost,
      })),
      ...reasonArg(input.reason),
    },
    INVENTORY,
  );
}

export async function ownerSetStockPurchaseDeletedAction(purchaseId: string, deleted: boolean, reason?: string): Promise<Result> {
  return run("owner_set_stock_purchase_deleted", { p_purchase_id: purchaseId, p_deleted: deleted, ...reasonArg(reason) }, INVENTORY);
}
