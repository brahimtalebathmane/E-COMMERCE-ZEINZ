import type { OrderStatus } from "@/types";

/**
 * Statuses that count toward realized revenue for the INTERNAL profit calculation.
 * Only `shipped` counts: a `confirmed` order can still be cancelled before it ships,
 * so it isn't a realized sale yet. `internal_return` is excluded — it was a sale but
 * has been returned, so its value is removed from profit metrics for accurate
 * bookkeeping.
 *
 * This is deliberately independent of the Meta Purchase CAPI event, which fires on
 * `confirmed` (see `src/lib/orders/update-status.ts`) and must keep doing so — that
 * event marks a conversion for ad-platform optimization, not realized revenue, and
 * changing this function has no effect on it.
 */
export function isRevenueStatus(status: OrderStatus): boolean {
  return status === "shipped";
}

/** Minimal order shape required to compute profit aggregates. */
export type ProfitOrderInput = {
  product_id: string;
  total_price: number;
  status: OrderStatus;
  /** ISO timestamp the order was created; used for the per-product cutoff. */
  created_at: string;
  /** Per-order delivery/shipping cost (MRU). Null/undefined treated as 0. */
  delivery_cost?: number | null;
};

/**
 * Returns true when an order should be counted given a product's optional
 * profit calculation start date. A null/empty/invalid cutoff means "no filter"
 * (life-to-date). The comparison is inclusive of the start calendar date.
 */
export function isOrderOnOrAfterStartDate(
  createdAt: string,
  startDate: string | null | undefined,
): boolean {
  if (!startDate) return true;
  const start = new Date(startDate).getTime();
  if (!Number.isFinite(start)) return true;
  const created = new Date(createdAt).getTime();
  // Never silently drop an order we cannot parse.
  if (!Number.isFinite(created)) return true;
  return created >= start;
}

/** Per-product profit breakdown rendered by the analytics dashboard. */
export type ProductProfitRow = {
  productId: string;
  name: string;
  /** Acquisition cost per unit (0 when not configured). */
  costPrice: number;
  /** Count of revenue-generating orders (shipped only). */
  unitsSold: number;
  /** Sum of selling prices for revenue-generating orders. */
  grossRevenue: number;
  /** unitsSold * costPrice. */
  cogs: number;
  /** Sum of delivery_cost across revenue-generating (shipped) orders. */
  deliveryCost: number;
  /** Live ad spend, summed across all of this product's linked Meta campaigns. */
  adSpend: number;
  /** Count of orders flagged internal_return (informational). */
  internalReturns: number;
  /** Whether a cost price has been configured for this product. */
  hasCost: boolean;
  /** Inclusive cutoff date (YYYY-MM-DD) or null for life-to-date metrics. */
  calculationStartDate: string | null;
};

/** Net Profit = Gross Revenue - (COGS + Delivery Cost + Ad Spend). */
export function netProfit(input: {
  grossRevenue: number;
  cogs: number;
  deliveryCost: number;
  adSpend: number;
}): number {
  return input.grossRevenue - (input.cogs + input.deliveryCost + input.adSpend);
}

export type ProfitTotals = {
  grossRevenue: number;
  cogs: number;
  deliveryCost: number;
  adSpend: number;
  netProfit: number;
  unitsSold: number;
  internalReturns: number;
};

export function sumProfitTotals(rows: ProductProfitRow[]): ProfitTotals {
  const totals: ProfitTotals = {
    grossRevenue: 0,
    cogs: 0,
    deliveryCost: 0,
    adSpend: 0,
    netProfit: 0,
    unitsSold: 0,
    internalReturns: 0,
  };
  for (const row of rows) {
    totals.grossRevenue += row.grossRevenue;
    totals.cogs += row.cogs;
    totals.deliveryCost += row.deliveryCost;
    totals.adSpend += row.adSpend;
    totals.unitsSold += row.unitsSold;
    totals.internalReturns += row.internalReturns;
  }
  totals.netProfit = netProfit(totals);
  return totals;
}

type ProductMeta = {
  name: string;
  costPrice: number | null;
  calculationStartDate?: string | null;
};

/**
 * Builds per-product profit rows from raw orders, product metadata, and the
 * live ad-spend map (summed per product from `product_ad_spend_daily`). Pure &
 * deterministic so the same logic backs the server render and the client-side
 * live recalculation.
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
        deliveryCost: 0,
        adSpend: adSpendByProduct.get(productId) ?? 0,
        internalReturns: 0,
        hasCost: cost != null && Number.isFinite(cost),
        calculationStartDate: meta?.calculationStartDate ?? null,
      };
      byProduct.set(productId, row);
    }
    return row;
  }

  for (const order of orders) {
    if (!order.product_id) continue;
    const startDate = products.get(order.product_id)?.calculationStartDate;
    if (!isOrderOnOrAfterStartDate(order.created_at, startDate)) continue;
    const row = ensureRow(order.product_id);
    if (order.status === "internal_return") {
      row.internalReturns += 1;
      continue;
    }
    if (isRevenueStatus(order.status)) {
      const price = Number(order.total_price);
      const delivery = Number(order.delivery_cost);
      row.unitsSold += 1;
      row.grossRevenue += Number.isFinite(price) ? price : 0;
      row.cogs += row.costPrice;
      row.deliveryCost += Number.isFinite(delivery) ? delivery : 0;
    }
  }

  // Include products that only have ad spend (no revenue-generating orders yet)
  // so the spend is still visible and reflected in the totals.
  for (const [productId, amount] of adSpendByProduct) {
    if (amount > 0 && !byProduct.has(productId)) {
      ensureRow(productId);
    }
  }

  return Array.from(byProduct.values()).sort(
    (a, b) => netProfit(b) - netProfit(a) || b.grossRevenue - a.grossRevenue,
  );
}
