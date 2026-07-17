"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import {
  buildProductProfitRows,
  netProfit,
  sumProfitTotals,
  type ProfitTotals,
} from "@/lib/analytics/profit";
import {
  bucketWeekly,
  computeLossStreak,
  computeTrend,
  type CombinedDailyProfit,
  type DailyProductProfit,
  type Granularity,
} from "@/lib/analytics/daily-profit";
import { AdminPageHeader, KPI_ACCENT } from "@/components/admin/ui";
import type { AnalyticsData, LinkedCampaign } from "./data";
import {
  linkAdCampaignAction,
  unlinkAdCampaignAction,
  updateCalculationStartDateAction,
} from "./actions";

const FRESHNESS_TIME_FORMATTER = new Intl.DateTimeFormat("ar", {
  hour: "2-digit",
  minute: "2-digit",
});

function profitToneClass(value: number): string {
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-red-400";
  return "text-[var(--foreground)]";
}

function tickDateLabel(dateKey: string): string {
  const parts = dateKey.split("-");
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : dateKey;
}

export function AnalyticsView({ data }: { data: AnalyticsData }) {
  const router = useRouter();
  const [startDates, setStartDates] = useState<Record<string, string>>(() =>
    Object.fromEntries(data.products.map((p) => [p.productId, p.calculationStartDate ?? ""])),
  );
  const [savingDateId, setSavingDateId] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const [expandedCampaigns, setExpandedCampaigns] = useState<string | null>(null);

  // Instant client-side recompute on start-date change, same engine as the
  // server render — ad spend itself is live/server-computed now, so it's held
  // constant here (not re-derived) while only the date cutoff changes.
  const rows = useMemo(() => {
    const productsMap = new Map(
      data.products.map((p) => [
        p.productId,
        { name: p.name, costPrice: p.costPrice, calculationStartDate: startDates[p.productId] || null },
      ]),
    );
    const adSpendByProduct = new Map(data.rows.map((r) => [r.productId, r.adSpend]));
    return buildProductProfitRows({ orders: data.orders, products: productsMap, adSpendByProduct });
  }, [data.orders, data.products, data.rows, startDates]);

  const totals = useMemo(() => sumProfitTotals(rows), [rows]);

  const dailyByProduct = useMemo(() => {
    const map = new Map<string, DailyProductProfit[]>();
    for (const row of data.daily) {
      const list = map.get(row.productId);
      if (list) list.push(row);
      else map.set(row.productId, [row]);
    }
    return map;
  }, [data.daily]);

  const combinedBucketed = useMemo(
    () => bucketWeekly(data.combined, granularity) as CombinedDailyProfit[],
    [data.combined, granularity],
  );

  async function onChangeStartDate(productId: string, nextDate: string) {
    if (savingDateId) return;
    const value = nextDate || "";
    const prev = startDates;
    if ((prev[productId] ?? "") === value) return;

    setSavingDateId(productId);
    setStartDates((cur) => ({ ...cur, [productId]: value }));

    try {
      const res = await updateCalculationStartDateAction(productId, value === "" ? null : value);
      if (!res.ok) throw new Error(res.error);
      setStartDates((cur) => ({ ...cur, [productId]: res.startDate ?? "" }));
      toast.success(value === "" ? a.analytics.startDateCleared : a.analytics.startDateSaved);
      router.refresh();
    } catch (error) {
      setStartDates(prev);
      toast.error(error instanceof Error ? error.message : a.analytics.startDateSaveFailed);
    } finally {
      setSavingDateId(null);
    }
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader title={a.analytics.title} subtitle={a.analytics.subtitle} />

      <section className="admin-card p-4 sm:p-5">
        <h2 className="text-base font-semibold text-[var(--foreground)]">
          {a.analytics.sectionOverviewTitle}
        </h2>
        <div className="mt-4">
          <SummaryBar data={data} />
        </div>
      </section>

      <CombinedTrendChart
        rows={combinedBucketed}
        granularity={granularity}
        onGranularityChange={setGranularity}
      />

      <div>
        <FinancialSummaryCard totals={totals} />
        {!data.adSpendFreshness.refreshed && data.adSpendFreshness.lastError ? (
          <p className="mt-2 text-xs text-amber-300">{a.analytics.adSpendRefreshFailed}</p>
        ) : null}
      </div>

      {/* Per-product breakdown */}
      <section className="admin-card overflow-hidden">
        <div className="border-b border-[var(--admin-border)] px-4 py-4 sm:px-5">
          <h2 className="text-base font-semibold text-[var(--foreground)]">
            {a.analytics.tableTitle}
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">{a.analytics.tableHint}</p>
        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--muted)] sm:px-5">
            {a.analytics.noData}
          </p>
        ) : (
          <div className="divide-y divide-[var(--admin-border)]">
            {rows.map((row) => {
              const profit = netProfit(row);
              const productDaily = dailyByProduct.get(row.productId) ?? [];
              const trend = computeTrend({ productDaily, todayKey: data.todayKey });
              const lossStreak = computeLossStreak({ productDaily, todayKey: data.todayKey });
              const campaigns = data.campaignsByProduct.get(row.productId) ?? [];

              return (
                <div key={row.productId} className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/analytics/${row.productId}`}
                          className="break-words font-semibold text-[var(--foreground)] underline-offset-2 hover:underline"
                        >
                          {row.name}
                        </Link>
                        <TrendArrow direction={trend.direction} hasEnoughData={trend.hasEnoughData} />
                        {lossStreak.flagged ? <LossStreakBadge streak={lossStreak.streak} /> : null}
                        {row.internalReturns > 0 ? (
                          <span
                            className="inline-flex items-center rounded-full border border-slate-400/30 bg-slate-400/10 px-2 py-0.5 text-[10px] font-semibold text-slate-300"
                            title={a.analytics.returnsNote}
                          >
                            {a.analytics.colReturns}: {row.internalReturns}
                          </span>
                        ) : null}
                      </div>
                      <Sparkline daily={productDaily} />
                    </div>
                    <span className={`shrink-0 text-lg font-bold ${profitToneClass(profit)}`} dir="ltr">
                      {formatPrice(profit)}
                    </span>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
                    <Stat label={a.analytics.colUnits} value={String(row.unitsSold)} />
                    <Stat label={a.analytics.colRevenue} value={formatPrice(row.grossRevenue)} />
                    <Stat
                      label={a.analytics.colCogs}
                      value={row.hasCost ? formatPrice(row.cogs) : a.analytics.costMissing}
                      muted={!row.hasCost}
                    />
                    <Stat label={a.analytics.colDeliveryCost} value={formatPrice(row.deliveryCost)} />
                    <Stat label={a.analytics.colAdSpend} value={formatPrice(row.adSpend)} />
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                        {a.analytics.colStartDate}
                      </dt>
                      <dd>
                        <StartDateEditor
                          value={startDates[row.productId] ?? ""}
                          saving={savingDateId === row.productId}
                          onChange={(v) => void onChangeStartDate(row.productId, v)}
                        />
                      </dd>
                    </div>
                  </dl>

                  {campaigns.length > 0 ? (
                    <p className="mt-2 text-[10px] text-[var(--muted)]" dir="ltr">
                      {a.analytics.adSpendFreshAsOf.replace(
                        "{time}",
                        (() => {
                          const fetchedAt = data.adSpendFetchedAtByProduct.get(row.productId);
                          return fetchedAt ? FRESHNESS_TIME_FORMATTER.format(new Date(fetchedAt)) : "—";
                        })(),
                      )}
                    </p>
                  ) : null}

                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedCampaigns((cur) => (cur === row.productId ? null : row.productId))
                      }
                      className="text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
                    >
                      {a.analytics.manageCampaigns} ({campaigns.length})
                    </button>
                    {expandedCampaigns === row.productId ? (
                      <CampaignManager
                        productId={row.productId}
                        initialCampaigns={campaigns}
                        onChanged={() => router.refresh()}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryBar({ data }: { data: AnalyticsData }) {
  const { summary } = data;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <SummaryTile label={a.analytics.summaryToday} value={formatPrice(summary.todayProfit)} tone={profitToneClass(summary.todayProfit)} />
      <SummaryTile label={a.analytics.summary7d} value={formatPrice(summary.avg7d)} tone={profitToneClass(summary.avg7d)} />
      <SummaryTile label={a.analytics.summary30d} value={formatPrice(summary.avg30d)} tone={profitToneClass(summary.avg30d)} />
      <SummaryTile
        label={a.analytics.summaryBestProduct}
        value={summary.bestProduct ? summary.bestProduct.name : a.analytics.summaryNoProduct}
        sub={summary.bestProduct ? formatPrice(summary.bestProduct.avgDailyNetProfit) : undefined}
        tone={summary.bestProduct ? profitToneClass(summary.bestProduct.avgDailyNetProfit) : undefined}
      />
      <SummaryTile
        label={a.analytics.summaryWorstProduct}
        value={summary.worstProduct ? summary.worstProduct.name : a.analytics.summaryNoProduct}
        sub={summary.worstProduct ? formatPrice(summary.worstProduct.avgDailyNetProfit) : undefined}
        tone={summary.worstProduct ? profitToneClass(summary.worstProduct.avgDailyNetProfit) : undefined}
      />
    </div>
  );
}

function SummaryTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="admin-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className={`mt-2 truncate text-base font-bold ${tone ?? "text-[var(--foreground)]"}`}>{value}</p>
      {sub ? (
        <p className={`mt-0.5 text-xs tabular-nums ${tone ?? "text-[var(--muted)]"}`} dir="ltr">
          {sub}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Mini P&L: gross revenue at top, costs subtracted as subordinate rows, then
 * net profit set off by a divider — so the relationship between the numbers
 * (what's subtracted from what) is visible at a glance instead of five
 * equal-weight tiles that all read the same regardless of role.
 */
function FinancialSummaryCard({ totals }: { totals: ProfitTotals }) {
  return (
    <section className="admin-card p-4 sm:p-5">
      <h2 className="text-base font-semibold text-[var(--foreground)]">
        {a.analytics.sectionFinancialTitle}
      </h2>
      <div className="mt-4 space-y-1">
        <PnlRow
          label={a.analytics.kpiGrossRevenue}
          hint={a.analytics.kpiGrossRevenueHint}
          value={totals.grossRevenue}
          accent={KPI_ACCENT.revenue}
        />
        <PnlRow
          label={a.analytics.kpiCogs}
          hint={a.analytics.kpiCogsHint}
          value={totals.cogs}
          sign="−"
        />
        <PnlRow
          label={a.analytics.kpiDeliveryCost}
          hint={a.analytics.kpiDeliveryCostHint}
          value={totals.deliveryCost}
          sign="−"
        />
        <PnlRow
          label={a.analytics.kpiAdSpend}
          hint={a.analytics.kpiAdSpendHint}
          value={totals.adSpend}
          sign="−"
        />
        <div className="my-2 border-t border-[var(--admin-border)]" />
        <PnlRow
          label={a.analytics.kpiNetProfit}
          hint={a.analytics.kpiNetProfitHint}
          value={totals.netProfit}
          sign="="
          emphasize
        />
      </div>
    </section>
  );
}

function PnlRow({
  label,
  hint,
  value,
  sign = "",
  accent,
  emphasize,
}: {
  label: string;
  hint?: string;
  value: number;
  sign?: "" | "−" | "=";
  accent?: string;
  emphasize?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 ${emphasize ? "pt-1" : "py-1.5"}`}>
      <div className="min-w-0">
        <p
          className={`flex items-center gap-2 ${emphasize ? "text-sm font-bold text-[var(--foreground)]" : "text-sm font-medium text-[var(--foreground)]"}`}
        >
          {accent ? (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: accent }}
              aria-hidden
            />
          ) : (
            <span className="w-2 shrink-0 text-center text-[var(--muted)]" aria-hidden>
              {sign}
            </span>
          )}
          <span>{label}</span>
        </p>
        {hint ? <p className="mt-0.5 text-[11px] text-[var(--muted)]">{hint}</p> : null}
      </div>
      <span
        className={`shrink-0 tabular-nums ${emphasize ? "text-lg font-bold" : "text-sm font-semibold"} ${emphasize ? profitToneClass(value) : "text-[var(--foreground)]"}`}
        dir="ltr"
      >
        {formatPrice(value)}
      </span>
    </div>
  );
}

function CombinedTrendChart({
  rows,
  granularity,
  onGranularityChange,
}: {
  rows: CombinedDailyProfit[];
  granularity: Granularity;
  onGranularityChange: (g: Granularity) => void;
}) {
  return (
    <section className="admin-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--foreground)]">
          {a.analytics.combinedChartTitle}
        </h2>
        <div className="inline-flex overflow-hidden rounded-lg border border-[var(--accent-muted)]">
          {(["daily", "weekly"] as Granularity[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onGranularityChange(g)}
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
      <div className="mt-4 h-64 w-full">
        {rows.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-[var(--muted)]">
            {a.analytics.noData}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border)" />
              <XAxis
                dataKey="date"
                tickFormatter={tickDateLabel}
                stroke="var(--muted)"
                fontSize={11}
              />
              <YAxis stroke="var(--muted)" fontSize={11} width={70} tickFormatter={(v) => formatPrice(Number(v))} />
              <Tooltip
                formatter={(value) => formatPrice(Number(value))}
                labelFormatter={(label) => String(label)}
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
  );
}

function Sparkline({ daily }: { daily: DailyProductProfit[] }) {
  const recent = useMemo(() => [...daily].sort((x, y) => x.date.localeCompare(y.date)).slice(-14), [daily]);
  if (recent.length < 2) return null;
  return (
    <div className="mt-1 h-8 w-28">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={recent}>
          <Line type="monotone" dataKey="netProfit" stroke="var(--accent)" strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendArrow({
  direction,
  hasEnoughData,
}: {
  direction: "up" | "down" | "flat";
  hasEnoughData: boolean;
}) {
  if (!hasEnoughData) {
    return (
      <span className="text-[10px] text-[var(--muted)]" title={a.analytics.trendInsufficientData}>
        —
      </span>
    );
  }
  if (direction === "up") {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-emerald-400" aria-label={a.analytics.trendUp}>
        <path d="M8 3l5 6H3z" fill="currentColor" />
      </svg>
    );
  }
  if (direction === "down") {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-red-400" aria-label={a.analytics.trendDown}>
        <path d="M8 13l-5-6h10z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <span className="text-[10px] text-[var(--muted)]" title={a.analytics.trendFlat}>
      →
    </span>
  );
}

function LossStreakBadge({ streak }: { streak: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-red-400/40 bg-red-400/10 px-2 py-0.5 text-[10px] font-semibold text-red-300"
      title={a.analytics.lossStreakWarning.replace("{count}", String(streak))}
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
        <path
          d="M8 1.5 1 14h14L8 1.5Zm0 4.5v4M8 11.5h.01"
          stroke="currentColor"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
      {a.analytics.lossStreakWarning.replace("{count}", String(streak))}
    </span>
  );
}

function CampaignManager({
  productId,
  initialCampaigns,
  onChanged,
}: {
  productId: string;
  initialCampaigns: LinkedCampaign[];
  onChanged: () => void;
}) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [draft, setDraft] = useState("");
  const [linking, setLinking] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  async function onLink() {
    const id = draft.trim();
    if (!id || linking) return;
    setLinking(true);
    try {
      const res = await linkAdCampaignAction(productId, id);
      if (!res.ok) throw new Error(res.error);
      setCampaigns((cur) => [...cur, { id: res.campaign.id, metaCampaignId: res.campaign.metaCampaignId, label: res.campaign.label }]);
      setDraft("");
      toast.success(a.analytics.campaignLinked);
      if (res.syncWarning) toast.warning(res.syncWarning);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : a.analytics.campaignLinkFailed);
    } finally {
      setLinking(false);
    }
  }

  async function onUnlink(campaignRowId: string) {
    if (unlinkingId) return;
    setUnlinkingId(campaignRowId);
    try {
      const res = await unlinkAdCampaignAction(productId, campaignRowId);
      if (!res.ok) throw new Error(res.error);
      setCampaigns((cur) => cur.filter((c) => c.id !== campaignRowId));
      toast.success(a.analytics.campaignUnlinked);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : a.analytics.campaignUnlinkFailed);
    } finally {
      setUnlinkingId(null);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-[var(--admin-border)] bg-white/[0.02] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {a.analytics.campaignsTitle}
      </p>
      {campaigns.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--muted)]">{a.analytics.noCampaignsLinked}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {campaigns.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-mono" dir="ltr">
                {c.label ? `${c.label} (${c.metaCampaignId})` : c.metaCampaignId}
              </span>
              <button
                type="button"
                disabled={unlinkingId === c.id}
                onClick={() => void onUnlink(c.id)}
                className="shrink-0 text-[11px] font-semibold text-red-300 underline-offset-2 hover:underline disabled:opacity-60"
              >
                {a.analytics.unlinkCampaign}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          dir="ltr"
          disabled={linking}
          value={draft}
          placeholder={a.analytics.campaignIdPlaceholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void onLink();
            }
          }}
          className="admin-input w-full !text-xs"
        />
        <button
          type="button"
          disabled={linking || !draft.trim()}
          onClick={() => void onLink()}
          className="admin-btn-primary w-full !px-3 !text-xs sm:w-auto"
        >
          {linking ? a.analytics.linking : a.analytics.linkCampaign}
        </button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
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

function StartDateEditor({
  value,
  saving,
  onChange,
}: {
  value: string;
  saving: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input
        type="date"
        dir="ltr"
        disabled={saving}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="admin-input w-full max-w-full !text-xs tabular-nums sm:w-36"
      />
      {value ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => onChange("")}
          className="admin-btn-ghost w-full !px-3 !text-xs sm:w-auto"
        >
          {a.analytics.startDateClear}
        </button>
      ) : null}
    </div>
  );
}
