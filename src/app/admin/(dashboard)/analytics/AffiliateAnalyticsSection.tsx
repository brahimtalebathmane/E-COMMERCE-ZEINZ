"use client";

import { useMemo } from "react";
import { formatMoney } from "@/lib/currency";
import {
  buildProductProfitRows,
  netProfit,
  sumProfitTotals,
  type ProductProfitRow,
  type ProfitTotals,
} from "@/lib/analytics/profit";
import { computeProfitabilityMetrics } from "@/lib/analytics/metrics";
import { filterDailyByPeriod, filterOrdersByPeriod, type Period } from "@/lib/analytics/period";
import { AdminBadge } from "@/components/admin/ui";
import type { AffiliateAnalyticsData } from "./data";

function profitToneClass(value: number): string {
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-red-400";
  return "text-[var(--foreground)]";
}

function formatPercent(pct: number): string {
  return `${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(1)}%`;
}

type CurrencyGroup = { currency: string; rows: ProductProfitRow[]; totals: ProfitTotals };

/**
 * Affiliate (COD Partner) profit, grouped by each product's own currency.
 * Deliberately separate from AnalyticsView's owned/MRU dashboard — amounts
 * here are never summed across currencies or with owned MRU totals.
 *
 * Recomputes `groups` client-side (period-filtered orders + ad spend through
 * the same `buildProductProfitRows` the server used to call) instead of
 * receiving pre-computed totals, so the period filter works here too without
 * a second server round-trip. For period "all" this is the exact same
 * function called with the exact same inputs the server used to use.
 */
export function AffiliateAnalyticsSection({
  data,
  period,
}: {
  data: AffiliateAnalyticsData;
  period: Period;
}) {
  const productsMap = useMemo(
    () =>
      new Map(
        data.products.map((p) => [
          p.productId,
          {
            name: p.name,
            costPrice: p.costPrice,
            calculationStartDate: p.calculationStartDate,
            fulfillmentType: "affiliate" as const,
            affiliateCommissionType: p.affiliateCommissionType,
            affiliateFixedCommission: p.affiliateFixedCommission,
            affiliateSellPrice: p.affiliateSellPrice,
            currency: p.currency,
          },
        ]),
      ),
    [data.products],
  );

  const mruPerUnitByCurrency = useMemo(
    () => new Map(Object.entries(data.mruPerUnitByCurrency)),
    [data.mruPerUnitByCurrency],
  );

  const groups = useMemo<CurrencyGroup[]>(() => {
    const periodOrders = filterOrdersByPeriod(data.orders, period);
    const periodAdSpendDaily = filterDailyByPeriod(data.adSpendDaily, period);
    const rows = buildProductProfitRows({
      orders: periodOrders,
      products: productsMap,
      adSpendDaily: periodAdSpendDaily,
      mruPerUnitByCurrency,
    });

    const byCurrency = new Map<string, ProductProfitRow[]>();
    for (const row of rows) {
      const code = row.currency || "—";
      const list = byCurrency.get(code) ?? [];
      list.push(row);
      byCurrency.set(code, list);
    }

    return Array.from(byCurrency.entries())
      .map(([currency, groupRows]) => ({
        currency,
        rows: groupRows,
        // A row whose ad spend couldn't be converted is excluded from the
        // group's totals entirely (never a converted-looking number) — it
        // still renders in the list below with "غير متاح" cells.
        totals: sumProfitTotals(groupRows.filter((r) => !r.adSpendUnavailable)),
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency));
  }, [data.orders, data.adSpendDaily, period, productsMap, mruPerUnitByCurrency]);

  if (groups.length === 0) return null;

  return (
    <section className="admin-card overflow-hidden">
      <div className="border-b border-[var(--admin-border)] px-4 py-4 sm:px-5">
        <h2 className="text-base font-semibold text-[var(--foreground)]">
          أرباح المنتجات التابعة (COD Partner)
        </h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          كل عملة منفصلة تماماً عن غيرها ولا تُجمع مع أرباح المنتجات المملوكة (MRU).
        </p>
      </div>

      <div className="divide-y divide-[var(--admin-border)]">
        {groups.map((group) => (
          <div key={group.currency} className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-[var(--foreground)]" dir="ltr">
                {group.currency}
              </h3>
              <span
                className={`text-lg font-bold ${profitToneClass(group.totals.netProfit)}`}
                dir="ltr"
              >
                {formatMoney(group.totals.netProfit, group.currency)}
              </span>
            </div>

            <div className="mt-3 space-y-3">
              {group.rows.map((row) => {
                const profit = netProfit(row);
                const rowMetrics = computeProfitabilityMetrics({
                  netProfit: profit,
                  grossRevenue: row.grossRevenue,
                  adSpend: row.adSpend,
                  ordersCount: row.ordersCount,
                });
                return (
                  <div
                    key={row.productId}
                    className={`rounded-xl border p-3 ${
                      row.adSpendUnavailable
                        ? "border-amber-400/30 bg-amber-400/5"
                        : "border-[var(--admin-border)]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-[var(--foreground)]">{row.name}</span>
                      <span
                        className={`font-bold ${row.adSpendUnavailable ? "text-amber-400" : profitToneClass(profit)}`}
                        dir="ltr"
                      >
                        {row.adSpendUnavailable ? "غير متاح" : formatMoney(profit, row.currency)}
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <Stat label="الوحدات" value={String(row.unitsSold)} />
                      <Stat label="الإيراد" value={formatMoney(row.grossRevenue, row.currency)} />
                      {row.cogs > 0 ? (
                        <Stat label="التكلفة" value={formatMoney(row.cogs, row.currency)} />
                      ) : null}
                      {row.otherCosts > 0 ? (
                        <Stat
                          label="تكاليف إضافية"
                          value={formatMoney(row.otherCosts, row.currency)}
                        />
                      ) : null}
                      <Stat
                        label="الإعلانات"
                        value={row.adSpendUnavailable ? "غير متاح" : formatMoney(row.adSpend, row.currency)}
                        muted={row.adSpendUnavailable}
                      />
                      {row.awaitingCosts > 0 ? (
                        <Stat
                          label="بانتظار التكاليف"
                          value={String(row.awaitingCosts)}
                          muted
                        />
                      ) : null}
                      {row.misconfigured > 0 ? (
                        <Stat label="غير مُعدّ بشكل صحيح" value={String(row.misconfigured)} muted />
                      ) : null}
                    </dl>
                    {row.adSpendUnavailable ? (
                      <p className="mt-2 text-[11px] text-amber-400">
                        لا يوجد سعر صرف لعملة {row.currency || "هذا المنتج"} في currency_rates — تم استبعاد هذا الصف من إجمالي المجموعة.
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <MetricChip
                        label="الهامش"
                        value={rowMetrics.netMargin === null ? "—" : formatPercent(rowMetrics.netMargin)}
                        tone={rowMetrics.netMargin}
                      />
                      <MetricChip
                        label="ROAS"
                        value={row.adSpendUnavailable || rowMetrics.roas === null ? "—" : rowMetrics.roas.toFixed(2)}
                        tone={row.adSpendUnavailable ? null : rowMetrics.roas}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </dt>
      <dd
        className={`tabular-nums ${muted ? "text-[var(--muted)]" : "text-[var(--foreground)]"}`}
        dir="ltr"
      >
        {value}
      </dd>
    </div>
  );
}

function MetricChip({ label, value, tone }: { label: string; value: string; tone: number | null }) {
  const hue = tone === null ? "neutral" : tone > 0 ? "emerald" : tone < 0 ? "red" : "neutral";
  return (
    <AdminBadge hue={hue} size="sm" dot={false}>
      <span dir="ltr">
        {label}: {value}
      </span>
    </AdminBadge>
  );
}
