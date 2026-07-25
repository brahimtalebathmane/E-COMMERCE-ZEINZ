import type { AffiliateCommissionType, FulfillmentType, OrderStatus } from "@/types";

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
  /** Per-order delivery/shipping cost. Null/undefined treated as 0. Owned orders only. */
  delivery_cost?: number | null;
  /** Units of product_id in this order line. Null/undefined treated as 1. */
  quantity?: number | null;
  /** Affiliate set_price orders only: extra costs COD Partner reports after the sale. */
  affiliate_other_costs?: number | null;
  /**
   * Affiliate set_price orders only: profit stays excluded from totals until
   * this is true, even once status is already 'shipped'. Ignored for owned
   * and fixed-commission affiliate orders (always counted once shipped).
   */
  affiliate_costs_finalized?: boolean;
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
  /** owned (default) or affiliate. Determines which formula below applied. */
  fulfillmentType: FulfillmentType;
  /** Currency this row's amounts are denominated in — MRU for owned, the product's own currency for affiliate. Rows in different currencies must never be summed together. */
  currency: string;
  /** Acquisition cost per unit (0 when not configured). Owned COGS, or affiliate set_price cost_price. */
  costPrice: number;
  /** Count of revenue-generating orders (shipped only, and — for affiliate set_price — cost-finalized only). */
  unitsSold: number;
  /** Owned: sum of selling prices. Affiliate fixed: sum of commission earned. Affiliate set_price: sum of sell price. */
  grossRevenue: number;
  /** unitsSold * costPrice. Zero for affiliate fixed-commission (no COGS). */
  cogs: number;
  /** Sum of delivery_cost across revenue-generating orders. Owned only; always 0 for affiliate. */
  deliveryCost: number;
  /** Affiliate set_price only: sum of affiliate_other_costs across finalized shipped orders. */
  otherCosts: number;
  /** Live ad spend, summed across all of this product's linked Meta campaigns. */
  adSpend: number;
  /** Count of orders flagged internal_return (informational). */
  internalReturns: number;
  /** Count of affiliate set_price orders shipped but not yet cost-finalized (excluded from the totals above). */
  awaitingCosts: number;
  /** Whether a cost price has been configured for this product. */
  hasCost: boolean;
  /** Inclusive cutoff date (YYYY-MM-DD) or null for life-to-date metrics. */
  calculationStartDate: string | null;
};

/** Net Profit = Gross Revenue - (COGS + Delivery Cost + Other Costs + Ad Spend). */
export function netProfit(input: {
  grossRevenue: number;
  cogs: number;
  deliveryCost: number;
  otherCosts?: number;
  adSpend: number;
}): number {
  return (
    input.grossRevenue - (input.cogs + input.deliveryCost + (input.otherCosts ?? 0) + input.adSpend)
  );
}

export type ProfitTotals = {
  grossRevenue: number;
  cogs: number;
  deliveryCost: number;
  otherCosts: number;
  adSpend: number;
  netProfit: number;
  unitsSold: number;
  internalReturns: number;
};

/**
 * Sums rows into one totals object. Callers MUST only pass rows that share
 * the same currency (e.g. all-owned/MRU rows, or one affiliate currency's
 * rows) — this function has no currency awareness of its own.
 */
export function sumProfitTotals(rows: ProductProfitRow[]): ProfitTotals {
  const totals: ProfitTotals = {
    grossRevenue: 0,
    cogs: 0,
    deliveryCost: 0,
    otherCosts: 0,
    adSpend: 0,
    netProfit: 0,
    unitsSold: 0,
    internalReturns: 0,
  };
  for (const row of rows) {
    totals.grossRevenue += row.grossRevenue;
    totals.cogs += row.cogs;
    totals.deliveryCost += row.deliveryCost;
    totals.otherCosts += row.otherCosts;
    totals.adSpend += row.adSpend;
    totals.unitsSold += row.unitsSold;
    totals.internalReturns += row.internalReturns;
  }
  totals.netProfit = netProfit(totals);
  return totals;
}

export type ProductMeta = {
  name: string;
  costPrice: number | null;
  calculationStartDate?: string | null;
  /** Defaults to "owned" when omitted — existing owned-only callers are unaffected. */
  fulfillmentType?: FulfillmentType;
  affiliateCommissionType?: AffiliateCommissionType | null;
  affiliateFixedCommission?: number | null;
  affiliateSellPrice?: number | null;
  /** e.g. "KWD". Only meaningful when fulfillmentType = "affiliate". */
  currency?: string | null;
};

/**
 * Builds per-product profit rows from raw orders, product metadata, and the
 * live ad-spend map (summed per product from `product_ad_spend_daily`). Pure &
 * deterministic so the same logic backs the server render and the client-side
 * live recalculation.
 *
 * Formula by product type (all gated on isRevenueStatus, i.e. status='shipped'):
 * - owned: revenue − cost_price×qty − delivery_cost − adSpend (unchanged).
 * - affiliate fixed: +affiliate_fixed_commission per order − adSpend. No COGS/delivery.
 * - affiliate set_price: sell_price − cost_price − affiliate_other_costs − adSpend,
 *   but ONLY once affiliate_costs_finalized=true — otherwise the order is tallied
 *   into `awaitingCosts` and excluded from every total until finalized.
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
      const fulfillmentType = meta?.fulfillmentType ?? "owned";
      const isAffiliate = fulfillmentType === "affiliate";
      const cost = meta?.costPrice;
      row = {
        productId,
        name: meta?.name ?? "—",
        fulfillmentType,
        currency: isAffiliate ? meta?.currency ?? "" : "MRU",
        costPrice: cost != null && Number.isFinite(cost) ? cost : 0,
        unitsSold: 0,
        grossRevenue: 0,
        cogs: 0,
        deliveryCost: 0,
        otherCosts: 0,
        adSpend: adSpendByProduct.get(productId) ?? 0,
        internalReturns: 0,
        awaitingCosts: 0,
        hasCost: cost != null && Number.isFinite(cost),
        calculationStartDate: meta?.calculationStartDate ?? null,
      };
      byProduct.set(productId, row);
    }
    return row;
  }

  for (const order of orders) {
    if (!order.product_id) continue;
    const meta = products.get(order.product_id);
    const startDate = meta?.calculationStartDate;
    if (!isOrderOnOrAfterStartDate(order.created_at, startDate)) continue;
    const row = ensureRow(order.product_id);
    if (order.status === "internal_return") {
      row.internalReturns += 1;
      continue;
    }
    if (!isRevenueStatus(order.status)) continue;

    const quantity = Number(order.quantity) > 0 ? Number(order.quantity) : 1;

    if (row.fulfillmentType === "owned") {
      const price = Number(order.total_price);
      const delivery = Number(order.delivery_cost);
      row.unitsSold += quantity;
      row.grossRevenue += Number.isFinite(price) ? price : 0;
      row.cogs += row.costPrice * quantity;
      row.deliveryCost += Number.isFinite(delivery) ? delivery : 0;
      continue;
    }

    // Affiliate
    if (meta?.affiliateCommissionType === "fixed") {
      const commission = Number(meta.affiliateFixedCommission) || 0;
      row.unitsSold += quantity;
      row.grossRevenue += commission;
      continue;
    }
    if (meta?.affiliateCommissionType === "set_price") {
      if (!order.affiliate_costs_finalized) {
        row.awaitingCosts += 1;
        continue;
      }
      const sellPrice = Number(meta.affiliateSellPrice) || 0;
      const other = Number(order.affiliate_other_costs) || 0;
      row.unitsSold += quantity;
      row.grossRevenue += sellPrice;
      row.cogs += row.costPrice * quantity;
      row.otherCosts += other;
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
