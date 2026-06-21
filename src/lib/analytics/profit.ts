import type { OrderStatus } from "@/types";

/**
 * Statuses that represent a realized sale and therefore contribute to gross
 * revenue / COGS. `cancelled`, `pending`, `requires_human_intervention` and
 * `internal_return` are intentionally excluded:
 *   - cancelled / pending / needs-attention: never a completed sale.
 *   - internal_return: was a sale but has been returned, so its value is
 *     removed from the profit metrics for accurate bookkeeping.
 */
export function isRevenueStatus(status: OrderStatus): boolean {
  return status === "confirmed" || status === "shipped";
}

/** Minimal order shape required to compute profit aggregates. */
export type ProfitOrderInput = {
  product_id: string;
  total_price: number;
  status: OrderStatus;
};

/** Per-product profit breakdown rendered by the analytics dashboard. */
export type ProductProfitRow = {
  productId: string;
  name: string;
  /** Acquisition cost per unit (0 when not configured). */
  costPrice: number;
  /** Count of revenue-generating orders (confirmed + shipped). */
  unitsSold: number;
  /** Sum of selling prices for revenue-generating orders. */
  grossRevenue: number;
  /** unitsSold * costPrice. */
  cogs: number;
  /** Manually maintained cumulative ad spend (editable). */
  adSpend: number;
  /** Count of orders flagged internal_return (informational). */
  internalReturns: number;
  /** Whether a cost price has been configured for this product. */
  hasCost: boolean;
};

/** Net Profit = Gross Revenue - (COGS + Ad Spend). */
export function netProfit(input: {
  grossRevenue: number;
  cogs: number;
  adSpend: number;
}): number {
  return input.grossRevenue - (input.cogs + input.adSpend);
}

export type ProfitTotals = {
  grossRevenue: number;
  cogs: number;
  adSpend: number;
  netProfit: number;
  unitsSold: number;
  internalReturns: number;
};

export function sumProfitTotals(rows: ProductProfitRow[]): ProfitTotals {
  const totals: ProfitTotals = {
    grossRevenue: 0,
    cogs: 0,
    adSpend: 0,
    netProfit: 0,
    unitsSold: 0,
    internalReturns: 0,
  };
  for (const row of rows) {
    totals.grossRevenue += row.grossRevenue;
    totals.cogs += row.cogs;
    totals.adSpend += row.adSpend;
    totals.unitsSold += row.unitsSold;
    totals.internalReturns += row.internalReturns;
  }
  totals.netProfit = netProfit(totals);
  return totals;
}

type ProductMeta = { name: string; costPrice: number | null };

/**
 * Builds per-product profit rows from raw orders, product metadata, and the
 * manual ad spend ledger. Pure & deterministic so the same logic backs the
 * server render and the client-side live recalculation.
 */
export function buildProductProfitRows(params: {
  orders: ProfitOrderInput[];
  products: Map<string, ProductMeta>;
  adSpendByProduct: Map<string, number>;
}): ProductProfitRow[] {
  const { orders, products, adSpendByProduct } = params;
  const byProduct = new Map<string, ProductProfitRow>();

  function ensureRow(productId: string): ProductProfitRow {
    let row = byProduct.get(productId);
    if (!row) {
      const meta = products.get(productId);
      const cost = meta?.costPrice;
      row = {
        productId,
        name: meta?.name ?? "—",
        costPrice: cost != null && Number.isFinite(cost) ? cost : 0,
        unitsSold: 0,
        grossRevenue: 0,
        cogs: 0,
        adSpend: adSpendByProduct.get(productId) ?? 0,
        internalReturns: 0,
        hasCost: cost != null && Number.isFinite(cost),
      };
      byProduct.set(productId, row);
    }
    return row;
  }

  for (const order of orders) {
    if (!order.product_id) continue;
    const row = ensureRow(order.product_id);
    if (order.status === "internal_return") {
      row.internalReturns += 1;
      continue;
    }
    if (isRevenueStatus(order.status)) {
      const price = Number(order.total_price);
      row.unitsSold += 1;
      row.grossRevenue += Number.isFinite(price) ? price : 0;
      row.cogs += row.costPrice;
    }
  }

  // Include products that only have ad spend (no orders yet) so the spend is
  // still visible and reflected in the totals.
  for (const [productId, amount] of adSpendByProduct) {
    if (amount > 0 && !byProduct.has(productId)) {
      ensureRow(productId);
    }
  }

  return Array.from(byProduct.values()).sort(
    (a, b) =>
      netProfit(b) - netProfit(a) || b.grossRevenue - a.grossRevenue,
  );
}
