import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { stockLevel, type StockLevel } from "@/lib/inventory/calculations";

/**
 * Inventory reads. Callers pass the service-role client AFTER checking the
 * manage_inventory permission and the local-operations scope (RLS would also
 * allow these reads for such a user; the service role just keeps every page
 * on one code path).
 */

export type InventoryMovementType = "opening" | "purchase" | "sale_out" | "return_in" | "adjustment" | "damage";

export type StockRow = {
  productId: string;
  name: string;
  archived: boolean;
  costPrice: number | null;
  threshold: number | null;
  onHand: number;
  reserved: number;
  available: number;
  level: StockLevel;
};

export type MovementRow = {
  id: string;
  type: InventoryMovementType;
  quantity: number;
  unitCost: number | null;
  reason: string | null;
  orderId: string | null;
  isCorrection: boolean;
  createdAt: string;
  createdByName: string | null;
  /** Stock on hand right after this movement (ledger order). */
  balanceAfter: number;
};

export type PurchaseRow = {
  id: string;
  supplier: string;
  purchasedOn: string;
  extraCosts: number;
  note: string | null;
  createdAt: string;
  lines: { productId: string; productName: string; quantity: number; unitCost: number; landedUnitCost: number }[];
};

/** Inventory go-live moment for the country, or null before the opening count. */
export async function getInventoryGoLive(service: SupabaseClient, countryId: string): Promise<string | null> {
  const { data, error } = await service
    .from("inventory_settings")
    .select("go_live_at")
    .eq("country_id", countryId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.go_live_at as string | undefined) ?? null;
}

/**
 * One row per owned product of the country. Archived products are listed
 * only while they still hold (or owe) stock.
 */
export async function loadStockRows(service: SupabaseClient, countryId: string): Promise<StockRow[]> {
  const { rows, error } = await fetchAllRows<{
    product_id: string;
    name_ar: string | null;
    deleted_at: string | null;
    cost_price: number | null;
    low_stock_threshold: number | null;
    on_hand: number;
    reserved: number;
    available: number;
  }>(
    () =>
      service
        .from("inventory_stock")
        .select("product_id, name_ar, deleted_at, cost_price, low_stock_threshold, on_hand, reserved, available")
        .eq("country_id", countryId) as never,
    "product_id",
  );
  if (error) throw new Error(error);
  return rows
    .map((r) => {
      const available = Number(r.available) || 0;
      const threshold = r.low_stock_threshold == null ? null : Number(r.low_stock_threshold);
      return {
        productId: String(r.product_id),
        name: String(r.name_ar ?? "—"),
        archived: r.deleted_at != null,
        costPrice: r.cost_price == null ? null : Number(r.cost_price),
        threshold,
        onHand: Number(r.on_hand) || 0,
        reserved: Number(r.reserved) || 0,
        available,
        level: stockLevel(available, threshold),
      };
    })
    .filter((r) => !r.archived || r.onHand !== 0 || r.reserved !== 0)
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

/** Available quantity per product, or null when inventory isn't live yet. */
export async function loadAvailableByProduct(
  service: SupabaseClient,
  countryId: string,
): Promise<Map<string, number> | null> {
  if (!(await getInventoryGoLive(service, countryId))) return null;
  const rows = await loadStockRows(service, countryId);
  return new Map(rows.map((r) => [r.productId, r.available]));
}

/** Full movement history of one product, oldest first, with running balance. */
export async function loadProductMovements(
  service: SupabaseClient,
  countryId: string,
  productId: string,
): Promise<MovementRow[]> {
  const { rows, error } = await fetchAllRows<{
    id: string;
    type: InventoryMovementType;
    quantity: number;
    unit_cost: number | null;
    reason: string | null;
    order_id: string | null;
    is_correction: boolean;
    created_at: string;
    created_by: string | null;
  }>(
    () =>
      service
        .from("inventory_movements")
        .select("id, type, quantity, unit_cost, reason, order_id, is_correction, created_at, created_by")
        .eq("country_id", countryId)
        .eq("product_id", productId) as never,
    ["created_at", "id"],
  );
  if (error) throw new Error(error);

  const userIds = [...new Set(rows.map((r) => r.created_by).filter((v): v is string => Boolean(v)))];
  const names = new Map<string, string>();
  if (userIds.length > 0) {
    const { data } = await service.from("profiles").select("id, display_name, email").in("id", userIds);
    for (const p of data ?? []) {
      names.set(String(p.id), String(p.display_name || p.email || ""));
    }
  }

  let balance = 0;
  return rows.map((r) => {
    balance += Number(r.quantity) || 0;
    return {
      id: String(r.id),
      type: r.type,
      quantity: Number(r.quantity) || 0,
      unitCost: r.unit_cost == null ? null : Number(r.unit_cost),
      reason: r.reason,
      orderId: r.order_id,
      isCorrection: Boolean(r.is_correction),
      createdAt: String(r.created_at),
      createdByName: r.created_by ? names.get(r.created_by) ?? null : null,
      balanceAfter: balance,
    };
  });
}

/** Most recent restocks with their lines. */
export async function loadRecentPurchases(
  service: SupabaseClient,
  countryId: string,
  limit = 20,
): Promise<PurchaseRow[]> {
  const { data: purchases, error } = await service
    .from("stock_purchases")
    .select("id, supplier, purchased_on, extra_costs, note, created_at")
    .eq("country_id", countryId)
    .order("purchased_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const ids = (purchases ?? []).map((p) => String(p.id));
  if (ids.length === 0) return [];

  const { data: lines, error: linesErr } = await service
    .from("stock_purchase_lines")
    .select("purchase_id, product_id, quantity, unit_cost, landed_unit_cost, products(name_ar)")
    .in("purchase_id", ids);
  if (linesErr) throw new Error(linesErr.message);

  const byPurchase = new Map<string, PurchaseRow["lines"]>();
  for (const l of lines ?? []) {
    const product = l.products as { name_ar?: string } | { name_ar?: string }[] | null;
    const productName = (Array.isArray(product) ? product[0]?.name_ar : product?.name_ar) ?? "—";
    const list = byPurchase.get(String(l.purchase_id)) ?? [];
    list.push({
      productId: String(l.product_id),
      productName,
      quantity: Number(l.quantity),
      unitCost: Number(l.unit_cost),
      landedUnitCost: Number(l.landed_unit_cost),
    });
    byPurchase.set(String(l.purchase_id), list);
  }

  return (purchases ?? []).map((p) => ({
    id: String(p.id),
    supplier: String(p.supplier ?? ""),
    purchasedOn: String(p.purchased_on),
    extraCosts: Number(p.extra_costs) || 0,
    note: (p.note as string | null) ?? null,
    createdAt: String(p.created_at),
    lines: byPurchase.get(String(p.id)) ?? [],
  }));
}
