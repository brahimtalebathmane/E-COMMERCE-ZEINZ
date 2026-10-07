/**
 * Pure inventory arithmetic, shared by the restock form (preview), the server
 * actions (cost suggestions) and the unit tests. The database computes the
 * stored landed cost itself (create_stock_purchase, migration 072) with the
 * same rule; landedUnitCosts() mirrors it for the on-screen preview.
 */

export type PurchaseLineInput = { quantity: number; unitCost: number };

/**
 * Landed unit cost per line: unit cost + its share of the purchase's extra
 * costs (shipping, customs), spread by line value (quantity × unit cost), or
 * by quantity when every line is free. Rounded to 4 decimals like the DB.
 */
export function landedUnitCosts(lines: PurchaseLineInput[], extraCosts: number): number[] {
  const extra = Number.isFinite(extraCosts) && extraCosts > 0 ? extraCosts : 0;
  const totalValue = lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);
  const totalQty = lines.reduce((sum, l) => sum + l.quantity, 0);
  return lines.map((l) => {
    let share = 0;
    if (extra > 0 && l.quantity > 0) {
      share =
        totalValue > 0
          ? (extra * ((l.quantity * l.unitCost) / totalValue)) / l.quantity
          : totalQty > 0
            ? extra / totalQty
            : 0;
    }
    return round4(l.unitCost + share);
  });
}

/**
 * Moving weighted-average cost after receiving stock: the units already on
 * hand are valued at the product's current cost price. When nothing usable is
 * on hand (0 or negative, or no current cost), the new landed cost is the
 * average. Rounded to 2 decimals (products.cost_price precision).
 */
export function weightedAverageCost(input: {
  onHandBefore: number;
  currentCost: number | null;
  receivedQty: number;
  receivedUnitCost: number;
}): number {
  const { onHandBefore, currentCost, receivedQty, receivedUnitCost } = input;
  if (receivedQty <= 0) return round2(currentCost ?? receivedUnitCost);
  if (onHandBefore <= 0 || currentCost == null || !Number.isFinite(currentCost)) {
    return round2(receivedUnitCost);
  }
  return round2((onHandBefore * currentCost + receivedQty * receivedUnitCost) / (onHandBefore + receivedQty));
}

export type StockLevel = "negative" | "low" | "ok";

/** negative: more sold/reserved than held; low: at or below the threshold. */
export function stockLevel(available: number, threshold: number | null | undefined): StockLevel {
  if (available < 0) return "negative";
  if (threshold != null && available <= threshold) return "low";
  return "ok";
}

/** True when a sale of `quantity` would take available stock below zero. */
export function exceedsAvailable(quantity: number, available: number | null | undefined): boolean {
  if (available == null) return false;
  return quantity > available;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
