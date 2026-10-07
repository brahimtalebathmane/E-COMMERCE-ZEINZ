import type { Period } from "@/lib/analytics/period";
import { monthRange } from "@/lib/analytics/period";

/**
 * Phase D: ties the treasury (cash) to the profits page (orders).
 *
 * The profits page already subtracts everything an order carries: cost of
 * goods, delivery cost and Meta ad spend. Treasury categories counted "orders"
 * (Sales, Delivery fees, Ads) are therefore never subtracted again. Only
 * categories counted "opex" (salaries, rent, daily expenses, packaging, cash
 * and settlement differences, and the owner's own opex categories) reduce
 * profit, and only from the treasury go-live date. Pure functions only.
 */

export type RecCategory = {
  id: string;
  parentId: string | null;
  name: string;
  systemKey: string | null;
  countedInProfitBy: "orders" | "opex" | "none";
};

export type RecTxn = {
  amount: number;
  categoryId: string;
  occurredOn: string;
  orderId?: string | null;
};

/** What the profits page and the home page need to subtract operating expenses. */
export type OpexData = {
  goLiveOn: string;
  todayKey: string;
  categories: RecCategory[];
  /** Movements of opex categories only, from go-live. */
  txns: RecTxn[];
};

/** Inclusive YYYY-MM-DD bounds. */
export type DateRange = { startKey: string; endKey: string };

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * The part of a period the treasury covers: never before go-live, never after
 * today. Null when the whole period is before go-live (nothing to compare).
 */
export function clipToTreasury(period: Period, goLiveOn: string, todayKey: string): DateRange | null {
  const base = period.kind === "all" ? { startKey: goLiveOn, endKey: todayKey } : monthRange(period.month);
  const startKey = base.startKey < goLiveOn ? goLiveOn : base.startKey;
  const endKey = base.endKey > todayKey ? todayKey : base.endKey;
  return startKey <= endKey ? { startKey, endKey } : null;
}

export function inRange(dayKey: string, range: DateRange): boolean {
  return dayKey >= range.startKey && dayKey <= range.endKey;
}

/** Subcategories behave like their parent (the database enforces it); this finds the parent. */
export function rootCategories(categories: RecCategory[]): Map<string, RecCategory> {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const roots = new Map<string, RecCategory>();
  for (const c of categories) roots.set(c.id, (c.parentId && byId.get(c.parentId)) || c);
  return roots;
}

export type OpexLine = { categoryId: string; name: string; amount: number };
export type OpexSummary = { total: number; byCategory: OpexLine[] };

/**
 * Operating expenses in a range, as a positive cost (an expense of 500 → 500;
 * a cash surplus found at a count → negative cost). Grouped by top-level
 * category; reversals carry the original category so they cancel out.
 */
export function summarizeOpex(txns: RecTxn[], categories: RecCategory[], range: DateRange | null): OpexSummary {
  if (!range) return { total: 0, byCategory: [] };
  const roots = rootCategories(categories);
  const byRoot = new Map<string, OpexLine>();
  for (const t of txns) {
    if (!inRange(t.occurredOn, range)) continue;
    const root = roots.get(t.categoryId);
    if (!root || root.countedInProfitBy !== "opex") continue;
    const line = byRoot.get(root.id) ?? { categoryId: root.id, name: root.name, amount: 0 };
    line.amount -= Number(t.amount) || 0;
    byRoot.set(root.id, line);
  }
  const byCategory = Array.from(byRoot.values())
    .map((l) => ({ ...l, amount: round2(l.amount) }))
    .filter((l) => l.amount !== 0)
    .sort((a, b) => b.amount - a.amount);
  return { total: round2(byCategory.reduce((s, l) => s + l.amount, 0)), byCategory };
}

export type CashBuckets = {
  sales: number;
  deliveryFees: number;
  ads: number;
  stockPurchases: number;
  ownerWithdrawals: number;
  capital: number;
  /** Signed sum of opex movements (an expense is negative here). */
  opex: number;
  other: number;
  /** Net change of all accounts in the range, opening balances and transfers excluded. */
  total: number;
};

const NOT_A_MOVEMENT = new Set(["transfer", "opening_balance"]);

/** Splits the cash movements of a range by what they mean for the profit bridge. */
export function bucketCash(txns: RecTxn[], categories: RecCategory[], range: DateRange | null): CashBuckets {
  const b: CashBuckets = {
    sales: 0,
    deliveryFees: 0,
    ads: 0,
    stockPurchases: 0,
    ownerWithdrawals: 0,
    capital: 0,
    opex: 0,
    other: 0,
    total: 0,
  };
  if (!range) return b;
  const roots = rootCategories(categories);
  for (const t of txns) {
    if (!inRange(t.occurredOn, range)) continue;
    const root = roots.get(t.categoryId);
    const key = root?.systemKey ?? null;
    if (key && NOT_A_MOVEMENT.has(key)) continue;
    const amount = Number(t.amount) || 0;
    b.total += amount;
    if (key === "sales") b.sales += amount;
    else if (key === "delivery_fees") b.deliveryFees += amount;
    else if (key === "ads") b.ads += amount;
    else if (key === "stock_purchases") b.stockPurchases += amount;
    else if (key === "owner_withdrawals") b.ownerWithdrawals += amount;
    else if (key === "capital") b.capital += amount;
    else if (root?.countedInProfitBy === "opex") b.opex += amount;
    else b.other += amount;
  }
  for (const k of Object.keys(b) as (keyof CashBuckets)[]) b[k] = round2(b[k]);
  return b;
}

export type OrderProfit = {
  grossRevenue: number;
  cogs: number;
  deliveryCost: number;
  adSpend: number;
  /** Profits-page net (revenue − COGS − delivery − ad spend). */
  netProfit: number;
};

export type BridgeKey =
  | "collectedVsEarned"
  | "deliveryFees"
  | "ads"
  | "stock"
  | "ownerWithdrawals"
  | "capital"
  | "other";

export type Bridge = {
  orderNetProfit: number;
  opex: number;
  netAfterOpex: number;
  lines: { key: BridgeKey; amount: number }[];
  cashChange: number;
  /** cash change − (net after opex + lines). 0 unless data is inconsistent. */
  unexplained: number;
};

/**
 * Profit → cash. Every line is "cash effect − profit effect" for one kind of
 * money, so  net after opex + Σ lines = cash change  holds exactly:
 * - collectedVsEarned: sales cash received − revenue of the period's orders
 *   (negative: money still with agents; positive: older orders paid now)
 * - deliveryFees: fees paid from the treasury vs fees recorded on orders
 * - ads: ads paid from the treasury vs Meta ad spend in profit
 * - stock: purchases paid vs cost of goods sold
 * - ownerWithdrawals / capital / other: cash moves that are not profit
 */
export function buildBridge(profit: OrderProfit, opex: OpexSummary, cash: CashBuckets): Bridge {
  const netAfterOpex = round2(profit.netProfit - opex.total);
  const lines: Bridge["lines"] = [
    { key: "collectedVsEarned", amount: round2(cash.sales - profit.grossRevenue) },
    { key: "deliveryFees", amount: round2(cash.deliveryFees + profit.deliveryCost) },
    { key: "ads", amount: round2(cash.ads + profit.adSpend) },
    { key: "stock", amount: round2(cash.stockPurchases + profit.cogs) },
    { key: "ownerWithdrawals", amount: cash.ownerWithdrawals },
    { key: "capital", amount: cash.capital },
    { key: "other", amount: round2(cash.other + cash.opex + opex.total) },
  ];
  const explained = round2(netAfterOpex + lines.reduce((s, l) => s + l.amount, 0));
  return {
    orderNetProfit: round2(profit.netProfit),
    opex: opex.total,
    netAfterOpex,
    lines,
    cashChange: cash.total,
    unexplained: round2(cash.total - explained),
  };
}

export type RevenueOrder = { id: string; totalPrice: number };
export type RevenueSplit = {
  settled: { count: number; amount: number };
  withAgents: { count: number; amount: number };
  /** Shipped before go-live and not carried over: paid outside the treasury. */
  outside: { count: number; amount: number };
};

/** Where the revenue of the period's shipped orders is now: settled, still with agents, or outside the treasury. */
export function splitRevenue(
  orders: RevenueOrder[],
  settledOrderIds: Set<string>,
  unsettledOrderIds: Set<string>,
): RevenueSplit {
  const split: RevenueSplit = {
    settled: { count: 0, amount: 0 },
    withAgents: { count: 0, amount: 0 },
    outside: { count: 0, amount: 0 },
  };
  for (const o of orders) {
    const bucket = settledOrderIds.has(o.id)
      ? split.settled
      : unsettledOrderIds.has(o.id)
        ? split.withAgents
        : split.outside;
    bucket.count += 1;
    bucket.amount += Number(o.totalPrice) || 0;
  }
  for (const b of Object.values(split)) b.amount = round2(b.amount);
  return split;
}

/** Sales entries typed by hand (no order linked) — they inflate cash without matching any order. */
export function unlinkedSales(txns: RecTxn[], categories: RecCategory[], range: DateRange | null): { count: number; amount: number } {
  if (!range) return { count: 0, amount: 0 };
  const roots = rootCategories(categories);
  let count = 0;
  let amount = 0;
  for (const t of txns) {
    if (!inRange(t.occurredOn, range) || t.orderId) continue;
    if (roots.get(t.categoryId)?.systemKey !== "sales") continue;
    count += 1;
    amount += Number(t.amount) || 0;
  }
  return { count, amount: round2(amount) };
}
