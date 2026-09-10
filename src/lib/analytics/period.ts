import { netProfit, type ProductProfitRow, type ProfitOrderInput } from "./profit";
import { dayKey, daysBetween, shiftDateKey } from "./daily-profit";

/** Life-to-date (current behaviour), or one specific calendar month (Africa/Nouakchott). */
export type Period = { kind: "all" } | { kind: "month"; month: string };

/** YYYY-MM from a YYYY-MM-DD day key. */
export function monthKeyOf(dayKeyValue: string): string {
  return dayKeyValue.slice(0, 7);
}

/**
 * First/last day keys (inclusive) of a calendar month. Pure UTC-calendar math
 * on the month string itself — no timezone conversion happens here, since
 * `month` is already a Nouakchott-correct key produced via `dayKey()`/`monthKeyOf()`.
 */
export function monthRange(month: string): { startKey: string; endKey: string } {
  const [y, m] = month.split("-").map(Number);
  const startKey = `${month}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)); // day 0 of next month = last day of this one
  const endKey = lastDay.toISOString().slice(0, 10);
  return { startKey, endKey };
}

/** Previous calendar month's YYYY-MM key, with year rollover. */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Unique YYYY-MM month keys present in a list of day keys, newest first. */
export function listMonthsWithData(dayKeys: (string | null | undefined)[]): string[] {
  const months = new Set<string>();
  for (const key of dayKeys) {
    if (key && /^\d{4}-\d{2}-\d{2}$/.test(key)) months.add(monthKeyOf(key));
  }
  return Array.from(months).sort((a, b) => b.localeCompare(a));
}

/** Filters orders to a period by their business date (`ordered_at`), never `created_at`. */
export function filterOrdersByPeriod<T extends ProfitOrderInput>(orders: T[], period: Period): T[] {
  if (period.kind === "all") return orders;
  const { startKey, endKey } = monthRange(period.month);
  return orders.filter((o) => {
    const key = dayKey(o.ordered_at);
    return key >= startKey && key <= endKey;
  });
}

/**
 * Filters any day-keyed series (daily/combined profit rows, or raw per-day
 * ad-spend rows) to a period. One generic filter reused everywhere a date
 * range needs applying, so there is exactly one place that logic can drift.
 */
export function filterDailyByPeriod<T extends { date: string }>(rows: T[], period: Period): T[] {
  if (period.kind === "all") return rows;
  const { startKey, endKey } = monthRange(period.month);
  return rows.filter((r) => r.date >= startKey && r.date <= endKey);
}

/**
 * Sums a period-filtered per-day ad-spend series into the product map
 * `buildProductProfitRows` expects. Callers pass an already period-filtered
 * array (via `filterDailyByPeriod`) so this stays a pure summation step.
 */
export function sumAdSpendByProduct(
  adSpendDaily: { product_id: string; date: string; amount: number }[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of adSpendDaily) {
    map.set(row.product_id, (map.get(row.product_id) ?? 0) + (Number(row.amount) || 0));
  }
  return map;
}

/**
 * Classifies every calendar day in a month (from an already period-filtered
 * combined series) as winning (netProfit > 0), losing (< 0), or neither (0 or
 * no activity that day). Missing days count as 0 — neither a win nor a loss —
 * consistent with the fixed-divisor philosophy used elsewhere in daily-profit.ts.
 */
export function countWinningLosingDays(
  combined: { date: string; netProfit: number }[],
  month: string,
): { winningDays: number; losingDays: number } {
  const { startKey, endKey } = monthRange(month);
  const byDate = new Map(combined.map((c) => [c.date, c.netProfit]));
  let winningDays = 0;
  let losingDays = 0;
  let cursor = startKey;
  while (cursor <= endKey) {
    const value = byDate.get(cursor) ?? 0;
    if (value > 0) winningDays += 1;
    else if (value < 0) losingDays += 1;
    cursor = shiftDateKey(cursor, 1);
  }
  return { winningDays, losingDays };
}

/** Number of calendar days in a YYYY-MM month. */
export function daysInMonth(month: string): number {
  const { startKey, endKey } = monthRange(month);
  return daysBetween(startKey, endKey) + 1;
}

/** `total / days`, 0 when `days` is not positive (never NaN/Infinity). */
export function averagePerDay(total: number, days: number): number {
  return days > 0 ? total / days : 0;
}

export type BestWorstProduct = { productId: string; name: string; netProfit: number };

/** Highest/lowest net-profit product among an already period-filtered row set. */
export function pickBestWorstProduct(rows: ProductProfitRow[]): {
  best: BestWorstProduct | null;
  worst: BestWorstProduct | null;
} {
  let best: BestWorstProduct | null = null;
  let worst: BestWorstProduct | null = null;
  for (const row of rows) {
    const value = netProfit(row);
    if (!best || value > best.netProfit) best = { productId: row.productId, name: row.name, netProfit: value };
    if (!worst || value < worst.netProfit) worst = { productId: row.productId, name: row.name, netProfit: value };
  }
  return { best, worst };
}
