"use server";

import { revalidatePath } from "next/cache";
import { assertPermission, AuthError } from "@/lib/auth/admin";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireLocalOperationsScope, type RequiredCountryScope } from "@/lib/auth/country-scope";
import { createServiceClient } from "@/lib/supabase/service";
import { getInventoryGoLive, loadStockRows } from "@/lib/inventory/data";
import { landedUnitCosts, weightedAverageCost } from "@/lib/inventory/calculations";

type ActionError = { ok: false; error: string };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Arabic message for the errors the inventory functions raise (migration 072). */
function inventoryErrorMessage(raw: string): string {
  if (raw.includes("inventory_not_live")) return "أدخل الجرد الافتتاحي أولاً لتفعيل المخزون.";
  if (raw.includes("inventory_already_live")) return "المخزون مُفعّل مسبقاً — لا يمكن إدخال الجرد الافتتاحي مرة ثانية.";
  if (raw.includes("inventory_movements_opening_key")) return "منتج مكرر في الجرد الافتتاحي.";
  if (raw.includes("a reason is required")) return "السبب مطلوب.";
  if (raw.includes("quantity must be negative")) return "التلف يُنقص المخزون: الكمية يجب أن تكون سالبة.";
  if (raw.includes("owned products")) return "المخزون خاص بالمنتجات المملوكة في موريتانيا فقط.";
  return raw;
}

function failure(error: unknown, fallback: string): ActionError {
  if (error instanceof AuthError) return { ok: false, error: error.message };
  if (error instanceof Error) return { ok: false, error: inventoryErrorMessage(error.message) };
  return { ok: false, error: fallback };
}

async function requireInventoryAccess(): Promise<{ userId: string; scope: RequiredCountryScope }> {
  const session = await assertPermission(PERMISSIONS.manage_inventory);
  const scope = await requireLocalOperationsScope();
  return { userId: session.access.userId, scope };
}

/** Every id must be an owned product of the selected (local-operations) country. */
async function assertOwnedProducts(
  service: ReturnType<typeof createServiceClient>,
  scope: RequiredCountryScope,
  productIds: string[],
): Promise<Map<string, { name: string; costPrice: number | null }>> {
  const unique = [...new Set(productIds)];
  if (unique.length === 0) return new Map();
  const { data, error } = await service
    .from("products")
    .select("id, name_ar, cost_price, country_id, fulfillment_type")
    .in("id", unique);
  if (error) throw new Error(error.message);
  const map = new Map<string, { name: string; costPrice: number | null }>();
  for (const p of data ?? []) {
    if (p.country_id !== scope.countryId || p.fulfillment_type !== "owned") {
      throw new AuthError(403, "المخزون خاص بالمنتجات المملوكة في موريتانيا فقط.");
    }
    map.set(String(p.id), {
      name: String(p.name_ar ?? "—"),
      costPrice: p.cost_price == null ? null : Number(p.cost_price),
    });
  }
  if (map.size !== unique.length) throw new Error("أحد المنتجات غير موجود.");
  return map;
}

function revalidateInventory(productIds: string[] = []) {
  revalidatePath("/admin/inventory");
  for (const id of productIds) revalidatePath(`/admin/inventory/${id}`);
}

// --- Go-live -----------------------------------------------------------------

export type OpeningCountLine = { productId: string; quantity: number };

export async function goLiveInventoryAction(
  counts: OpeningCountLine[],
): Promise<{ ok: true; goLiveAt: string } | ActionError> {
  try {
    const { userId, scope } = await requireInventoryAccess();
    const lines = (counts ?? []).filter((c) => c.productId);
    for (const line of lines) {
      if (!Number.isInteger(line.quantity) || line.quantity < 0) {
        return { ok: false, error: "الكميات يجب أن تكون أرقاماً صحيحة 0 أو أكثر." };
      }
    }
    const service = createServiceClient();
    await assertOwnedProducts(service, scope, lines.map((l) => l.productId));

    const { data, error } = await service.rpc("inventory_go_live", {
      p_country_id: scope.countryId,
      p_counts: lines.map((l) => ({ product_id: l.productId, quantity: l.quantity })),
      p_user: userId,
    });
    if (error) throw new Error(error.message);
    revalidateInventory();
    return { ok: true, goLiveAt: String(data) };
  } catch (error) {
    return failure(error, "تعذّر تفعيل المخزون.");
  }
}

// --- Restock -------------------------------------------------------------------

export type RestockLineInput = { productId: string; quantity: number; unitCost: number };
export type RestockInput = {
  supplier: string;
  /** YYYY-MM-DD */
  purchasedOn: string;
  extraCosts: number;
  note: string;
  lines: RestockLineInput[];
};

export type CostSuggestion = {
  productId: string;
  name: string;
  currentCost: number | null;
  onHandBefore: number;
  receivedQty: number;
  landedUnitCost: number;
  /** Moving weighted average after this restock — offered, never applied automatically. */
  suggestedCost: number;
};

export async function createStockPurchaseAction(
  input: RestockInput,
): Promise<{ ok: true; purchaseId: string; suggestions: CostSuggestion[] } | ActionError> {
  try {
    const { userId, scope } = await requireInventoryAccess();
    if (!ISO_DATE_RE.test(input.purchasedOn ?? "")) return { ok: false, error: "تاريخ الشراء غير صالح." };
    const extraCosts = Number(input.extraCosts) || 0;
    if (extraCosts < 0) return { ok: false, error: "التكاليف الإضافية لا يمكن أن تكون سالبة." };
    const lines = (input.lines ?? []).filter((l) => l.productId);
    if (lines.length === 0) return { ok: false, error: "أضف منتجاً واحداً على الأقل." };
    for (const l of lines) {
      if (!Number.isInteger(l.quantity) || l.quantity <= 0) {
        return { ok: false, error: "الكمية يجب أن تكون رقماً صحيحاً أكبر من 0." };
      }
      if (!Number.isFinite(l.unitCost) || l.unitCost < 0) {
        return { ok: false, error: "سعر الوحدة يجب أن يكون 0 أو أكثر." };
      }
    }

    const service = createServiceClient();
    const products = await assertOwnedProducts(service, scope, lines.map((l) => l.productId));
    const stockBefore = new Map((await loadStockRows(service, scope.countryId)).map((r) => [r.productId, r.onHand]));

    const { data: purchaseId, error } = await service.rpc("create_stock_purchase", {
      p_country_id: scope.countryId,
      p_supplier: input.supplier ?? "",
      p_purchased_on: input.purchasedOn,
      p_extra_costs: extraCosts,
      p_note: input.note ?? "",
      p_lines: lines.map((l) => ({ product_id: l.productId, quantity: l.quantity, unit_cost: l.unitCost })),
      p_user: userId,
    });
    if (error) throw new Error(error.message);

    // Weighted average per product (a product can appear on several lines).
    const landed = landedUnitCosts(lines, extraCosts);
    const received = new Map<string, { qty: number; value: number }>();
    lines.forEach((l, i) => {
      const cur = received.get(l.productId) ?? { qty: 0, value: 0 };
      cur.qty += l.quantity;
      cur.value += l.quantity * landed[i];
      received.set(l.productId, cur);
    });
    const suggestions: CostSuggestion[] = [...received.entries()].map(([productId, r]) => {
      const product = products.get(productId)!;
      const landedUnitCost = Math.round((r.value / r.qty) * 10000) / 10000;
      const onHandBefore = stockBefore.get(productId) ?? 0;
      return {
        productId,
        name: product.name,
        currentCost: product.costPrice,
        onHandBefore,
        receivedQty: r.qty,
        landedUnitCost,
        suggestedCost: weightedAverageCost({
          onHandBefore,
          currentCost: product.costPrice,
          receivedQty: r.qty,
          receivedUnitCost: landedUnitCost,
        }),
      };
    });

    revalidateInventory([...received.keys()]);
    return { ok: true, purchaseId: String(purchaseId), suggestions };
  } catch (error) {
    return failure(error, "تعذّر حفظ عملية الشراء.");
  }
}

/** Applies a suggested cost price. Past orders keep their own cost snapshot. */
export async function applySuggestedCostAction(
  productId: string,
  costPrice: number,
): Promise<{ ok: true } | ActionError> {
  try {
    const { scope } = await requireInventoryAccess();
    if (!Number.isFinite(costPrice) || costPrice < 0) return { ok: false, error: "سعر التكلفة غير صالح." };
    const service = createServiceClient();
    await assertOwnedProducts(service, scope, [productId]);
    const { error } = await service
      .from("products")
      .update({ cost_price: Math.round(costPrice * 100) / 100 })
      .eq("id", productId);
    if (error) throw new Error(error.message);
    revalidateInventory([productId]);
    revalidatePath("/admin/products");
    return { ok: true };
  } catch (error) {
    return failure(error, "تعذّر تحديث سعر التكلفة.");
  }
}

// --- Adjustments and thresholds -----------------------------------------------

export type AdjustmentInput = {
  productId: string;
  /** Signed: + adds stock, − removes it. Damage must be negative. */
  quantity: number;
  type: "adjustment" | "damage";
  reason: string;
};

export async function recordInventoryAdjustmentAction(
  input: AdjustmentInput,
): Promise<{ ok: true } | ActionError> {
  try {
    const { userId, scope } = await requireInventoryAccess();
    if (!Number.isInteger(input.quantity) || input.quantity === 0) {
      return { ok: false, error: "الكمية يجب أن تكون رقماً صحيحاً غير الصفر." };
    }
    if (!input.reason?.trim()) return { ok: false, error: "السبب مطلوب." };
    if (input.type !== "adjustment" && input.type !== "damage") return { ok: false, error: "نوع غير صالح." };
    const service = createServiceClient();
    await assertOwnedProducts(service, scope, [input.productId]);
    const { error } = await service.rpc("record_inventory_adjustment", {
      p_country_id: scope.countryId,
      p_product_id: input.productId,
      p_quantity: input.quantity,
      p_type: input.type,
      p_reason: input.reason.trim(),
      p_user: userId,
    });
    if (error) throw new Error(error.message);
    revalidateInventory([input.productId]);
    return { ok: true };
  } catch (error) {
    return failure(error, "تعذّر تسجيل التعديل.");
  }
}

export async function setLowStockThresholdAction(
  productId: string,
  threshold: number | null,
): Promise<{ ok: true; threshold: number | null } | ActionError> {
  try {
    const { scope } = await requireInventoryAccess();
    if (threshold !== null && (!Number.isInteger(threshold) || threshold < 0)) {
      return { ok: false, error: "الحد الأدنى يجب أن يكون رقماً صحيحاً 0 أو أكثر." };
    }
    const service = createServiceClient();
    await assertOwnedProducts(service, scope, [productId]);
    const { error } = await service.from("products").update({ low_stock_threshold: threshold }).eq("id", productId);
    if (error) throw new Error(error.message);
    revalidateInventory([productId]);
    return { ok: true, threshold };
  } catch (error) {
    return failure(error, "تعذّر حفظ الحد الأدنى.");
  }
}

/** Used by the go-live screen to refuse a second count before submitting. */
export async function inventoryGoLiveStatusAction(): Promise<{ ok: true; goLiveAt: string | null } | ActionError> {
  try {
    const { scope } = await requireInventoryAccess();
    return { ok: true, goLiveAt: await getInventoryGoLive(createServiceClient(), scope.countryId) };
  } catch (error) {
    return failure(error, "تعذّر قراءة حالة المخزون.");
  }
}
