"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { adminAr as a } from "@/locales/admin-ar";
import { formatPrice } from "@/lib/currency";
import { netProfit, type ProductProfitRow } from "@/lib/analytics/profit";
import {
  bucketWeekly,
  computeAverageDailyNetProfit,
  type DailyProductProfit,
  type Granularity,
} from "@/lib/analytics/daily-profit";

function profitToneClass(value: number): string {
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-red-400";
  return "text-[var(--foreground)]";
}

function tickDateLabel(dateKey: string): string {
  const parts = dateKey.split("-");
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : dateKey;
}

export function ProductAnalyticsView({
  row,
  productDaily,
  overallAvgDailyNetProfit,
  createdAt,
  todayKey,
}: {
  row: ProductProfitRow;
  productDaily: DailyProductProfit[];
  overallAvgDailyNetProfit: number;
  createdAt: string;
  todayKey: string;
}) {
  const [granularity, setGranularity] = useState<Granularity>("daily");

  const sorted = useMemo(
    () => [...productDaily].sort((x, y) => x.date.localeCompare(y.date)),
    [productDaily],
  );
  const bucketed = useMemo(() => bucketWeekly(sorted, granularity), [sorted, granularity]);

  const avgDailyNetProfit = useMemo(
    () => computeAverageDailyNetProfit({ productDaily: sorted, todayKey, createdAt }),
    [sorted, todayKey, createdAt],
  );

  return (
    <div className="mt-6 space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label={a.analytics.kpiNetProfit}
          value={formatPrice(netProfit(row))}
          tone={profitToneClass(netProfit(row))}
        />
        <SummaryCard
          label={a.analytics.productAvgDailyProfit}
          value={formatPrice(avgDailyNetProfit)}
          tone={profitToneClass(avgDailyNetProfit)}
        />
        <SummaryCard
          label={a.analytics.overallAvgDailyProfit}
          value={formatPrice(overallAvgDailyNetProfit)}
          tone={profitToneClass(overallAvgDailyNetProfit)}
        />
      </div>

      <section className="admin-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-[var(--foreground)]">
            {a.analytics.productDetailDayByDay}
          </h2>
          <div className="inline-flex overflow-hidden rounded-lg border border-[var(--accent-muted)]">
            {(["daily", "weekly"] as Granularity[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGranularity(g)}
                className={`px-3 py-1.5 text-xs font-semibold transition ${
                  granularity === g
                    ? "bg-[var(--accent)] text-white"
                    : "bg-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {g === "daily" ? a.analytics.granularityDaily : a.analytics.granularityWeekly}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 h-72 w-full">
          {bucketed.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-[var(--muted)]">
              {a.analytics.noData}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={bucketed}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border)" />
                <XAxis dataKey="date" tickFormatter={tickDateLabel} stroke="var(--muted)" fontSize={11} />
                <YAxis stroke="var(--muted)" fontSize={11} width={70} tickFormatter={(v) => formatPrice(Number(v))} />
                <Tooltip
                  formatter={(value) => formatPrice(Number(value))}
                  contentStyle={{
                    background: "var(--admin-elevated)",
                    border: "1px solid var(--admin-border-strong)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="netProfit" stroke="var(--accent)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="admin-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-white/[0.02] text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 text-start">{a.analytics.granularityDaily}</th>
                <th className="px-4 py-3 text-start">{a.analytics.colRevenue}</th>
                <th className="px-4 py-3 text-start">{a.analytics.colCogs}</th>
                <th className="px-4 py-3 text-start">{a.analytics.colDeliveryCost}</th>
                <th className="px-4 py-3 text-start">{a.analytics.colAdSpend}</th>
                <th className="px-4 py-3 text-start">{a.analytics.colNetProfit}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--admin-border)]">
              {[...bucketed].reverse().map((d) => (
                <tr key={d.date}>
                  <td className="px-4 py-3 tabular-nums" dir="ltr">
                    {d.date}
                  </td>
                  <td className="px-4 py-3 tabular-nums" dir="ltr">
                    {formatPrice(d.revenue)}
                  </td>
                  <td className="px-4 py-3 tabular-nums" dir="ltr">
                    {formatPrice(d.cogs)}
                  </td>
                  <td className="px-4 py-3 tabular-nums" dir="ltr">
                    {formatPrice(d.deliveryCost)}
                  </td>
                  <td className="px-4 py-3 tabular-nums" dir="ltr">
                    {formatPrice(d.adSpend)}
                  </td>
                  <td className={`px-4 py-3 font-bold tabular-nums ${profitToneClass(d.netProfit)}`} dir="ltr">
                    {formatPrice(d.netProfit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="admin-card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className={`mt-3 text-2xl font-bold tabular-nums ${tone}`} dir="ltr">
        {value}
      </p>
    </div>
  );
}
