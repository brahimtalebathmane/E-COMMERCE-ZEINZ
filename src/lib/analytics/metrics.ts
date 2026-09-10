/**
 * Profitability ratios derived from one totals-shaped input (life-to-date,
 * one period, or a single product row — same fields, same formulas). Every
 * division is guarded: a zero/undefined denominator returns `null`, never
 * `NaN`/`Infinity`, so the UI can render `—` instead of a misleading number.
 */
export type ProfitabilityMetrics = {
  /** netProfit / grossRevenue */
  netMargin: number | null;
  /** grossRevenue / adSpend */
  roas: number | null;
  /** netProfit / adSpend */
  profitPerAdSpend: number | null;
  /** adSpend / ordersCount — cost per (revenue-generating) order acquired */
  cpo: number | null;
  /** grossRevenue / ordersCount */
  aov: number | null;
  /** netProfit / ordersCount */
  avgOrderProfit: number | null;
};

function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

export function computeProfitabilityMetrics(input: {
  netProfit: number;
  grossRevenue: number;
  adSpend: number;
  ordersCount: number;
}): ProfitabilityMetrics {
  const { netProfit, grossRevenue, adSpend, ordersCount } = input;
  return {
    netMargin: safeDivide(netProfit, grossRevenue),
    roas: safeDivide(grossRevenue, adSpend),
    profitPerAdSpend: safeDivide(netProfit, adSpend),
    cpo: safeDivide(adSpend, ordersCount),
    aov: safeDivide(grossRevenue, ordersCount),
    avgOrderProfit: safeDivide(netProfit, ordersCount),
  };
}

/**
 * Percent change from `previous` to `current`. `null` when there is no valid
 * baseline (zero or non-finite `previous`) — a delta against nothing is not a
 * percentage, and must never render as `+Infinity%`.
 */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}
