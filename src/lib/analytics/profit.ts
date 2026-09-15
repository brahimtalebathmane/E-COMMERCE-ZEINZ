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
  /** ISO timestamp of the order's business date; used for the per-product cutoff. Editable by admins — NOT the row-insert timestamp (see orders.ordered_at vs created_at). */
  ordered_at: string;
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
  /**
   * products.cost_price at the moment this order was created. Preferred over
   * the live product cost so editing a product's cost price never changes
   * the COGS of past orders. Null for orders created before this snapshot
   * existed — those fall back to the product's current cost_price.
   */
  unit_cost_price?: number | null;
  /** products.affiliate_commission_type snapshot at order creation. Null falls back to the product's current value. */
  affiliate_commission_type_at_order?: AffiliateCommissionType | null;
  /** products.affiliate_fixed_commission snapshot at order creation. Null falls back to the product's current value. */
  affiliate_fixed_commission_at_order?: number | null;
  /** products.affiliate_sell_price snapshot at order creation. Null falls back to the product's current value. */
  affiliate_sell_price_at_order?: number | null;
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

/**
 * Ad-spend twin of `isOrderOnOrAfterStartDate`. A cutoff that hides a
 * product's old orders must hide the ad spend that produced them, or the
 * product shows spend with no revenue for the whole excluded window.
 */
export function isAdSpendOnOrAfterStartDate(
  date: string,
  startDate: string | null | undefined,
): boolean {
  if (!startDate) return true;
  const cutoff = String(startDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return true;
  return date >= cutoff;
}

/** Per-product profit breakdown rendered by the analytics dashboard. */
export type ProductProfitRow = {
  productId: string;
  name: string;
  /** owned (default) or affiliate. Determines which formula below applied. */
  fulfillmentType: FulfillmentType;
  /** Currency this row's amounts are denominated in — MRU for owned, the product's own currency for affiliate. Rows in different currencies must never be summed together. */
  currency: string;
  /**
   * The product's CURRENT acquisition cost per unit (0 when not configured).
   * Display-only ("this product costs X today") — NOT what `cogs` below is
   * computed from. Editing a product's cost_price changes this field
   * immediately but must never change `cogs` for past orders.
   */
  costPrice: number;
  /** Count of revenue-generating orders (shipped only, and — for affiliate set_price — cost-finalized only). */
  unitsSold: number;
  /**
   * Count of revenue-generating ORDER ROWS (not units — a qty=3 order counts
   * once here, three times in unitsSold). Same qualifying set as unitsSold,
   * incremented in lockstep so CPO/AOV/avg-order-profit (metrics.ts) never
   * drift from a separately-counted order total.
   */
  ordersCount: number;
  /** Owned: sum of selling prices. Affiliate fixed: sum of commission earned. Affiliate set_price: sum of sell price. */
  grossRevenue: number;
  /**
   * Sum of each order's OWN cost snapshot (`unit_cost_price`) × quantity —
   * never derived from `costPrice` above. This is what keeps a product's
   * cost-price edit from retroactively changing past profit; only orders
   * with a null snapshot (pre-dating the snapshot column) fall back to the
   * current `costPrice`. Zero for affiliate fixed-commission (no COGS).
   */
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
  /** Count of affiliate orders with neither a "fixed" nor "set_price" commission
   *  type on the order snapshot or the current product — contribute nothing to
   *  any total above (not revenue, not COGS, not ordersCount). Surfaced so a
   *  misconfigured product doesn't silently look identical to "no orders". */
  misconfigured: number;
  /** True when this row's ad spend could not be converted from MRU into its
   *  own currency (no `currency_rates` row) — `adSpend` was forced to 0 rather
   *  than shown as a converted-looking number. The UI must render "غير متاح"
   *  for this row's ad-spend/net-profit cells and exclude it from group totals. */
  adSpendUnavailable: boolean;
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
  ordersCount: number;
  /** Products in this total that contributed revenue with no cost price — their
   *  COGS counted as 0, so netProfit and netMargin are OVERSTATED by an unknown
   *  amount. Never render a total carrying this without the warning beside it. */
  productsMissingCost: number;
  /** Revenue contributed by those products, so the warning can state the size. */
  revenueMissingCost: number;
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
    ordersCount: 0,
    productsMissingCost: 0,
    revenueMissingCost: 0,
  };
  for (const row of rows) {
    totals.grossRevenue += row.grossRevenue;
    totals.cogs += row.cogs;
    totals.deliveryCost += row.deliveryCost;
    totals.otherCosts += row.otherCosts;
    totals.adSpend += row.adSpend;
    totals.unitsSold += row.unitsSold;
    totals.internalReturns += row.internalReturns;
    totals.ordersCount += row.ordersCount;
    if (!row.hasCost && row.grossRevenue > 0) {
      totals.productsMissingCost += 1;
      totals.revenueMissingCost += row.grossRevenue;
    }
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

/** Per-day, per-product ad spend row, as stored in `product_ad_spend_daily`. */
export type AdSpendDailyRow = { product_id: string; date: string; amount: number };

/**
 * Builds per-product profit rows from raw orders, product metadata, and the
 * per-day ad-spend series. Pure & deterministic so the same logic backs the
 * server render and the client-side live recalculation.
 *
 * Formula by product type (all gated on isRevenueStatus, i.e. status='shipped'):
 * - owned: revenue − cost×qty − delivery_cost − adSpend (unchanged).
 * - affiliate fixed: +commission×qty per order − adSpend. No COGS/delivery.
 * - affiliate set_price: sell_price×qty − cost×qty − affiliate_other_costs − adSpend,
 *   but ONLY once affiliate_costs_finalized=true — otherwise the order is tallied
 *   into `awaitingCosts` and excluded from every total until finalized.
 *
 * Every cost/commission/sell-price figure above is read from the ORDER's own
 * snapshot first (`unit_cost_price`, `affiliate_fixed_commission_at_order`,
 * `affiliate_sell_price_at_order`, `affiliate_commission_type_at_order`),
 * falling back to the product's current value only when the order predates
 * that snapshot (null). This is what makes editing a product's price/cost/
 * commission terms affect only future orders, never past profit.
 *
 * Ad spend is taken as per-day rows (not a pre-summed map) so each row can be
 * gated by the product's own `calculationStartDate` cutoff exactly like
 * orders are — a cutoff that hides a product's old orders must hide the ad
 * spend that produced them too.
 *
 * `mruPerUnitByCurrency` (from `currency_rates`) converts an affiliate row's
 * MRU-denominated ad spend into that row's own currency. When the row's
 * currency has no rate, `adSpend` is forced to 0 and `adSpendUnavailable` is
 * set — never a converted-looking number invented from a guessed rate.
 */
export function buildProductProfitRows(params: {
  orders: ProfitOrderInput[];
  products: Map<string, ProductMeta>;
  adSpendDaily: AdSpendDailyRow[];
  mruPerUnitByCurrency?: Map<string, number>;
}): ProductProfitRow[] {
  const { orders, products, adSpendDaily, mruPerUnitByCurrency } = params;
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
        ordersCount: 0,
        grossRevenue: 0,
        cogs: 0,
        deliveryCost: 0,
        otherCosts: 0,
        adSpend: 0,
        internalReturns: 0,
        awaitingCosts: 0,
        hasCost: cost != null && Number.isFinite(cost),
        calculationStartDate: meta?.calculationStartDate ?? null,
        misconfigured: 0,
        adSpendUnavailable: false,
      };
      byProduct.set(productId, row);
    }
    return row;
  }

  for (const order of orders) {
    if (!order.product_id) continue;
    const meta = products.get(order.product_id);
    const startDate = meta?.calculationStartDate;
    if (!isOrderOnOrAfterStartDate(order.ordered_at, startDate)) continue;
    const row = ensureRow(order.product_id);
    if (order.status === "internal_return") {
      row.internalReturns += 1;
      continue;
    }
    if (!isRevenueStatus(order.status)) continue;

    const quantity = Number(order.quantity) > 0 ? Number(order.quantity) : 1;
    const unitCost =
      order.unit_cost_price != null && Number.isFinite(Number(order.unit_cost_price))
        ? Number(order.unit_cost_price)
        : row.costPrice;

    if (row.fulfillmentType === "owned") {
      const price = Number(order.total_price);
      const delivery = Number(order.delivery_cost);
      row.unitsSold += quantity;
      row.ordersCount += 1;
      row.grossRevenue += Number.isFinite(price) ? price : 0;
      row.cogs += unitCost * quantity;
      row.deliveryCost += Number.isFinite(delivery) ? delivery : 0;
      continue;
    }

    // Affiliate
    const commissionType = order.affiliate_commission_type_at_order ?? meta?.affiliateCommissionType;
    if (commissionType === "fixed") {
      const commission = Number(order.affiliate_fixed_commission_at_order ?? meta?.affiliateFixedCommission) || 0;
      row.unitsSold += quantity;
      row.ordersCount += 1;
      row.grossRevenue += commission * quantity;
      continue;
    }
    if (commissionType === "set_price") {
      if (!order.affiliate_costs_finalized) {
        row.awaitingCosts += 1;
        continue;
      }
      const sellPrice = Number(order.affiliate_sell_price_at_order ?? meta?.affiliateSellPrice) || 0;
      const other = Number(order.affiliate_other_costs) || 0;
      row.unitsSold += quantity;
      row.ordersCount += 1;
      row.grossRevenue += sellPrice * quantity;
      row.cogs += unitCost * quantity;
      row.otherCosts += other;
      continue;
    }
    // Neither "fixed" nor "set_price": the order contributes nothing above —
    // flagged so it doesn't silently look identical to "no orders".
    row.misconfigured += 1;
  }

  // Ad spend, gated by the same per-product cutoff as orders.
  for (const spend of adSpendDaily) {
    if (!spend.product_id) continue;
    const meta = products.get(spend.product_id);
    if (!isAdSpendOnOrAfterStartDate(spend.date, meta?.calculationStartDate)) continue;
    const row = ensureRow(spend.product_id);
    row.adSpend += Number(spend.amount) || 0;
  }

  // Convert affiliate ad spend from MRU into the row's own currency. Owned
  // rows (currency "MRU") never need conversion.
  for (const row of byProduct.values()) {
    const code = row.currency?.trim().toUpperCase();
    if (!code || code === "MRU") continue;
    const rate = mruPerUnitByCurrency?.get(code);
    if (rate && rate > 0) {
      row.adSpend = row.adSpend / rate;
    } else if (row.adSpend > 0) {
      row.adSpend = 0;
      row.adSpendUnavailable = true;
    }
  }

  return Array.from(byProduct.values()).sort(
    (a, b) => netProfit(b) - netProfit(a) || b.grossRevenue - a.grossRevenue,
  );
}
