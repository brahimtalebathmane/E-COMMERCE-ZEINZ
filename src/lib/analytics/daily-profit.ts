import { isOrderOnOrAfterStartDate, isRevenueStatus, type ProfitOrderInput } from "./profit";

/**
 * Same day-bucketing timezone used by the admin home dashboard's "orders today"
 * count (`src/app/admin/(dashboard)/page.tsx`), so "today" means the same thing
 * everywhere in the admin panel.
 */
const DAY_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Nouakchott",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD calendar-day key (Africa/Nouakchott) for an order timestamp. */
export function dayKey(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return DAY_KEY_FORMATTER.format(d);
}

/** Shifts a YYYY-MM-DD key by `deltaDays` (may be negative). Pure calendar-date math. */
export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(aKey: string, bKey: string): number {
  const [ay, am, ad] = aKey.split("-").map(Number);
  const [by, bm, bd] = bKey.split("-").map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / DAY_MS);
}

/** Meta ad spend for one product on one calendar day (as stored in `product_ad_spend_daily`). */
export type AdSpendDailyInput = {
  product_id: string;
  /** YYYY-MM-DD, as returned by Meta's `time_increment=1` insights buckets. */
  date: string;
  amount: number;
};

export type DailyProductProfit = {
  date: string;
  productId: string;
  revenue: number;
  cogs: number;
  deliveryCost: number;
  adSpend: number;
  netProfit: number;
};

type ProductMeta = {
  name: string;
  costPrice: number | null;
  calculationStartDate?: string | null;
};

/**
 * Builds a per-day, per-product profit series from shipped orders + the live
 * ad-spend cache. Pure & deterministic, mirroring `profit.ts`'s life-to-date
 * builder. Days with no shipped order AND no ad-spend row simply have no entry
 * here (sparse) — callers that need "0 on quiet days" semantics (loss-streak,
 * trend comparisons, 7/30-day averages) account for that explicitly rather than
 * assuming every calendar day has a row.
 */
export function buildDailyProfitSeries(params: {
  orders: ProfitOrderInput[];
  products: Map<string, ProductMeta>;
  adSpendDaily: AdSpendDailyInput[];
}): DailyProductProfit[] {
  const { orders, products, adSpendDaily } = params;
  const byKey = new Map<string, DailyProductProfit>();

  function ensure(productId: string, date: string): DailyProductProfit {
    const key = `${productId}|${date}`;
    let row = byKey.get(key);
    if (!row) {
      row = { date, productId, revenue: 0, cogs: 0, deliveryCost: 0, adSpend: 0, netProfit: 0 };
      byKey.set(key, row);
    }
    return row;
  }

  for (const order of orders) {
    if (!order.product_id || !isRevenueStatus(order.status)) continue;
    const meta = products.get(order.product_id);
    if (!isOrderOnOrAfterStartDate(order.created_at, meta?.calculationStartDate)) continue;
    const date = dayKey(order.created_at);
    if (!date) continue;

    const costPrice = meta?.costPrice != null && Number.isFinite(meta.costPrice) ? meta.costPrice : 0;
    const price = Number(order.total_price);
    const delivery = Number(order.delivery_cost);

    const row = ensure(order.product_id, date);
    row.revenue += Number.isFinite(price) ? price : 0;
    row.cogs += costPrice;
    row.deliveryCost += Number.isFinite(delivery) ? delivery : 0;
  }

  for (const spend of adSpendDaily) {
    if (!spend.product_id || !spend.date) continue;
    const row = ensure(spend.product_id, spend.date);
    row.adSpend += Number(spend.amount) || 0;
  }

  for (const row of byKey.values()) {
    row.netProfit = row.revenue - (row.cogs + row.deliveryCost + row.adSpend);
  }

  return Array.from(byKey.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export type CombinedDailyProfit = {
  date: string;
  revenue: number;
  cogs: number;
  deliveryCost: number;
  adSpend: number;
  netProfit: number;
};

/** Sums the per-product daily series into an all-products daily rollup (for the combined chart). */
export function combineAcrossProducts(daily: DailyProductProfit[]): CombinedDailyProfit[] {
  const byDate = new Map<string, CombinedDailyProfit>();
  for (const row of daily) {
    let combined = byDate.get(row.date);
    if (!combined) {
      combined = { date: row.date, revenue: 0, cogs: 0, deliveryCost: 0, adSpend: 0, netProfit: 0 };
      byDate.set(row.date, combined);
    }
    combined.revenue += row.revenue;
    combined.cogs += row.cogs;
    combined.deliveryCost += row.deliveryCost;
    combined.adSpend += row.adSpend;
    combined.netProfit += row.netProfit;
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export type Granularity = "daily" | "weekly";

type Bucketable = {
  date: string;
  revenue: number;
  cogs: number;
  deliveryCost: number;
  adSpend: number;
  netProfit: number;
};

/**
 * Buckets a sparse daily series into trailing 7-day windows keyed by each
 * bucket's END date, working backward from the most recent date present in
 * `daily` — NOT calendar/ISO weeks. This keeps "weekly" meaning "the last 7
 * days ending here", consistent with the 7/30-day rolling windows used
 * elsewhere in this file, instead of introducing an unrelated week-boundary
 * convention that could split an active week awkwardly.
 */
export function bucketWeekly<T extends Bucketable>(daily: T[], granularity: Granularity): Bucketable[] {
  if (granularity === "daily") return daily.map((d) => ({ ...d }));

  const descending = [...daily].sort((a, b) => b.date.localeCompare(a.date));
  const buckets: Bucketable[] = [];
  for (let i = 0; i < descending.length; i += 7) {
    const chunk = descending.slice(i, i + 7);
    const bucketEndDate = chunk[0].date;
    const agg = chunk.reduce<Bucketable>(
      (acc, d) => ({
        date: bucketEndDate,
        revenue: acc.revenue + d.revenue,
        cogs: acc.cogs + d.cogs,
        deliveryCost: acc.deliveryCost + d.deliveryCost,
        adSpend: acc.adSpend + d.adSpend,
        netProfit: acc.netProfit + d.netProfit,
      }),
      { date: bucketEndDate, revenue: 0, cogs: 0, deliveryCost: 0, adSpend: 0, netProfit: 0 },
    );
    buckets.push(agg);
  }
  return buckets.reverse();
}

function sumNetProfitInWindow(combined: CombinedDailyProfit[], todayKey: string, windowDays: number): number {
  const startKey = shiftDateKey(todayKey, -(windowDays - 1));
  let sum = 0;
  for (const row of combined) {
    if (row.date >= startKey && row.date <= todayKey) sum += row.netProfit;
  }
  return sum;
}

export type ProductSummary = {
  productId: string;
  name: string;
  avgDailyNetProfit: number;
  /** Number of calendar days the average was divided by (<=30). */
  daysConsidered: number;
};

export type DashboardSummary = {
  todayProfit: number;
  /** Combined net profit over the trailing 7 days, divided by 7 (quiet days count as 0). */
  avg7d: number;
  /** Combined net profit over the trailing 30 days, divided by 30 (quiet days count as 0). */
  avg30d: number;
  bestProduct: ProductSummary | null;
  worstProduct: ProductSummary | null;
};

type ProductSummaryMeta = { name: string; createdAt?: string | null };

/**
 * today/7-day-avg/30-day-avg use FIXED divisors (7, 30) so a quiet day counts
 * as 0 rather than being excluded — an honest daily run-rate, not inflated by
 * only averaging over active days. Best/worst product = highest/lowest average
 * daily net profit over the trailing 30 days, falling back to the product's
 * full available history (via `createdAt`) when it's younger than 30 days.
 * Only products with at least one day of recorded activity are considered.
 */
export function computeSummary(params: {
  daily: DailyProductProfit[];
  combined: CombinedDailyProfit[];
  products: Map<string, ProductSummaryMeta>;
  todayKey: string;
}): DashboardSummary {
  const { daily, combined, products, todayKey } = params;

  const todayProfit = combined.find((c) => c.date === todayKey)?.netProfit ?? 0;
  const avg7d = sumNetProfitInWindow(combined, todayKey, 7) / 7;
  const avg30d = sumNetProfitInWindow(combined, todayKey, 30) / 30;

  const byProduct = new Map<string, DailyProductProfit[]>();
  for (const row of daily) {
    const list = byProduct.get(row.productId);
    if (list) list.push(row);
    else byProduct.set(row.productId, [row]);
  }

  const windowStart = shiftDateKey(todayKey, -29);
  let bestProduct: ProductSummary | null = null;
  let worstProduct: ProductSummary | null = null;

  for (const [productId, rows] of byProduct) {
    const meta = products.get(productId);
    const inWindow = rows.filter((r) => r.date >= windowStart && r.date <= todayKey);
    const sum = inWindow.reduce((s, r) => s + r.netProfit, 0);

    const createdAtKey = meta?.createdAt ? dayKey(meta.createdAt) : null;
    const earliestPossible = createdAtKey && createdAtKey > windowStart ? createdAtKey : windowStart;
    const daysConsidered = Math.max(1, Math.min(30, daysBetween(earliestPossible, todayKey) + 1));

    const candidate: ProductSummary = {
      productId,
      name: meta?.name ?? "—",
      avgDailyNetProfit: sum / daysConsidered,
      daysConsidered,
    };

    if (!bestProduct || candidate.avgDailyNetProfit > bestProduct.avgDailyNetProfit) bestProduct = candidate;
    if (!worstProduct || candidate.avgDailyNetProfit < worstProduct.avgDailyNetProfit) worstProduct = candidate;
  }

  return { todayProfit, avg7d, avg30d, bestProduct, worstProduct };
}

/**
 * A single product's average daily net profit over the trailing `windowDays`
 * (default 30), falling back to its full available history when younger than
 * that — same fixed-divisor-with-zero-inclusion methodology as `computeSummary`'s
 * best/worst-product ranking, so the drill-down page's number is directly
 * comparable to the dashboard's summary bar.
 */
export function computeAverageDailyNetProfit(params: {
  productDaily: DailyProductProfit[];
  todayKey: string;
  createdAt?: string | null;
  windowDays?: number;
}): number {
  const { productDaily, todayKey, createdAt, windowDays = 30 } = params;
  const windowStart = shiftDateKey(todayKey, -(windowDays - 1));
  const sum = productDaily
    .filter((d) => d.date >= windowStart && d.date <= todayKey)
    .reduce((s, d) => s + d.netProfit, 0);

  const createdAtKey = createdAt ? dayKey(createdAt) : null;
  const earliestPossible = createdAtKey && createdAtKey > windowStart ? createdAtKey : windowStart;
  const daysConsidered = Math.max(1, Math.min(windowDays, daysBetween(earliestPossible, todayKey) + 1));
  return sum / daysConsidered;
}

export type TrendDirection = "up" | "down" | "flat";

/**
 * Compares the average of the most recent 3 calendar days against the prior 3
 * (a 6-day window anchored at the product's most recent activity date, not
 * necessarily "today" — a product with no orders yet today still gets judged
 * on its last complete days rather than snapping to "flat"). Missing days
 * within the window count as 0. Returns `hasEnoughData: false` when the
 * product has under 6 days of history, so the UI can grey out the arrow
 * instead of showing a misleading direction for a brand-new product.
 */
export function computeTrend(params: { productDaily: DailyProductProfit[]; todayKey: string }): {
  direction: TrendDirection;
  hasEnoughData: boolean;
} {
  const { productDaily, todayKey } = params;
  const byDate = new Map(productDaily.map((r) => [r.date, r.netProfit]));
  const availableDates = [...byDate.keys()].filter((d) => d <= todayKey).sort();
  if (availableDates.length === 0) return { direction: "flat", hasEnoughData: false };

  const anchor = availableDates[availableDates.length - 1];
  const earliest = availableDates[0];
  if (daysBetween(earliest, anchor) + 1 < 6) return { direction: "flat", hasEnoughData: false };

  const sumWindow = (startKey: string, endKey: string) => {
    let sum = 0;
    let cursor = startKey;
    while (cursor <= endKey) {
      sum += byDate.get(cursor) ?? 0;
      cursor = shiftDateKey(cursor, 1);
    }
    return sum;
  };

  const recentAvg = sumWindow(shiftDateKey(anchor, -2), anchor) / 3;
  const priorAvg = sumWindow(shiftDateKey(anchor, -5), shiftDateKey(anchor, -3)) / 3;

  if (recentAvg > priorAvg) return { direction: "up", hasEnoughData: true };
  if (recentAvg < priorAvg) return { direction: "down", hasEnoughData: true };
  return { direction: "flat", hasEnoughData: true };
}

/**
 * Trailing consecutive-day count where net profit was negative, scanned by
 * actual calendar day (a day with no recorded activity has net profit 0, which
 * breaks the streak) starting from the product's most recent activity date.
 * `flagged` at 3+ per the "losing money for several consecutive days" warning.
 */
export function computeLossStreak(params: {
  productDaily: DailyProductProfit[];
  todayKey: string;
}): { streak: number; flagged: boolean } {
  const { productDaily, todayKey } = params;
  const byDate = new Map(productDaily.map((r) => [r.date, r.netProfit]));
  const availableDates = [...byDate.keys()].filter((d) => d <= todayKey).sort();
  if (availableDates.length === 0) return { streak: 0, flagged: false };

  let cursor = availableDates[availableDates.length - 1];
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const value = byDate.get(cursor);
    if (value == null || value >= 0) break;
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return { streak, flagged: streak >= 3 };
}
