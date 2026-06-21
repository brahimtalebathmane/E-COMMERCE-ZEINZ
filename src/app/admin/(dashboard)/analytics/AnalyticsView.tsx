"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { adminAr as a } from "@/locales/admin-ar";
import { formatPrice } from "@/lib/currency";
import {
  buildProductProfitRows,
  netProfit,
  sumProfitTotals,
  type ProfitOrderInput,
} from "@/lib/analytics/profit";
import {
  updateAdSpendAction,
  updateCalculationStartDateAction,
} from "./actions";

export type ProductMetaInput = {
  productId: string;
  name: string;
  costPrice: number | null;
  calculationStartDate: string | null;
};

type Props = {
  orders: ProfitOrderInput[];
  products: ProductMetaInput[];
  adSpend: Record<string, number>;
};

function profitToneClass(value: number): string {
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-red-400";
  return "text-[var(--foreground)]";
}

export function AnalyticsView({ orders, products, adSpend }: Props) {
  const [adSpendMap, setAdSpendMap] = useState<Record<string, number>>(adSpend);
  const [startDates, setStartDates] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      products.map((p) => [p.productId, p.calculationStartDate ?? ""]),
    ),
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingDateId, setSavingDateId] = useState<string | null>(null);

  // Pure, deterministic recompute: the same engine that backs the server render
  // also powers instant client-side updates when ad spend or a start date change.
  const rows = useMemo(() => {
    const productsMap = new Map(
      products.map((p) => [
        p.productId,
        {
          name: p.name,
          costPrice: p.costPrice,
          calculationStartDate: startDates[p.productId] || null,
        },
      ]),
    );
    const adSpendByProduct = new Map(
      Object.entries(adSpendMap).map(([id, amount]) => [id, amount]),
    );
    return buildProductProfitRows({ orders, products: productsMap, adSpendByProduct });
  }, [orders, products, startDates, adSpendMap]);

  const totals = useMemo(() => sumProfitTotals(rows), [rows]);

  async function onSaveAdSpend(productId: string) {
    if (savingId) return;
    const raw = drafts[productId] ?? String(adSpendMap[productId] ?? 0);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error(a.analytics.saveFailed);
      return;
    }
    const amount = Math.round(parsed * 100) / 100;

    setSavingId(productId);
    const prev = adSpendMap;
    setAdSpendMap((cur) => ({ ...cur, [productId]: amount }));

    try {
      const res = await updateAdSpendAction(productId, amount);
      if (!res.ok) {
        throw new Error(res.error);
      }
      setAdSpendMap((cur) => ({ ...cur, [productId]: res.amount }));
      setDrafts((d) => ({ ...d, [productId]: String(res.amount) }));
      toast.success(a.analytics.saved);
    } catch (error) {
      setAdSpendMap(prev);
      toast.error(error instanceof Error ? error.message : a.analytics.saveFailed);
    } finally {
      setSavingId(null);
    }
  }

  async function onChangeStartDate(productId: string, nextDate: string) {
    if (savingDateId) return;
    const value = nextDate || "";
    const prev = startDates;
    if ((prev[productId] ?? "") === value) return;

    setSavingDateId(productId);
    setStartDates((cur) => ({ ...cur, [productId]: value }));

    try {
      const res = await updateCalculationStartDateAction(
        productId,
        value === "" ? null : value,
      );
      if (!res.ok) {
        throw new Error(res.error);
      }
      setStartDates((cur) => ({ ...cur, [productId]: res.startDate ?? "" }));
      toast.success(value === "" ? a.analytics.startDateCleared : a.analytics.startDateSaved);
    } catch (error) {
      setStartDates(prev);
      toast.error(
        error instanceof Error ? error.message : a.analytics.startDateSaveFailed,
      );
    } finally {
      setSavingDateId(null);
    }
  }

  return (
    <div className="mt-8 space-y-8">
      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={a.analytics.kpiGrossRevenue}
          hint={a.analytics.kpiGrossRevenueHint}
          value={formatPrice(totals.grossRevenue)}
          accent="revenue"
        />
        <KpiCard
          label={a.analytics.kpiCogs}
          hint={a.analytics.kpiCogsHint}
          value={formatPrice(totals.cogs)}
          accent="cost"
        />
        <KpiCard
          label={a.analytics.kpiAdSpend}
          hint={a.analytics.kpiAdSpendHint}
          value={formatPrice(totals.adSpend)}
          accent="ad"
        />
        <KpiCard
          label={a.analytics.kpiNetProfit}
          hint={a.analytics.kpiNetProfitHint}
          value={formatPrice(totals.netProfit)}
          accent="profit"
          emphasizeTone={profitToneClass(totals.netProfit)}
        />
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
          <>
            {/* Mobile cards */}
            <div className="space-y-3 p-3 md:hidden">
              {rows.map((row) => {
                const profit = netProfit(row);
                return (
                  <div
                    key={row.productId}
                    className="rounded-2xl border border-[var(--admin-border)] bg-white/[0.02] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 break-words font-semibold text-[var(--foreground)]">
                        {row.name}
                      </p>
                      <span className={`shrink-0 text-sm font-bold ${profitToneClass(profit)}`} dir="ltr">
                        {formatPrice(profit)}
                      </span>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <Stat label={a.analytics.colUnits} value={String(row.unitsSold)} />
                      <Stat label={a.analytics.colRevenue} value={formatPrice(row.grossRevenue)} />
                      <Stat
                        label={a.analytics.colCogs}
                        value={row.hasCost ? formatPrice(row.cogs) : a.analytics.costMissing}
                        muted={!row.hasCost}
                      />
                      {row.internalReturns > 0 ? (
                        <Stat
                          label={a.analytics.colReturns}
                          value={String(row.internalReturns)}
                        />
                      ) : null}
                    </dl>
                    <div className="mt-3">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                        {a.analytics.colAdSpend}
                      </label>
                      <AdSpendEditor
                        value={drafts[row.productId] ?? String(row.adSpend)}
                        saving={savingId === row.productId}
                        onChange={(v) =>
                          setDrafts((d) => ({ ...d, [row.productId]: v }))
                        }
                        onSave={() => void onSaveAdSpend(row.productId)}
                      />
                    </div>
                    <div className="mt-3">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                        {a.analytics.colStartDate}
                      </label>
                      <StartDateEditor
                        value={startDates[row.productId] ?? ""}
                        saving={savingDateId === row.productId}
                        onChange={(v) => void onChangeStartDate(row.productId, v)}
                      />
                      <p className="mt-1 text-[10px] leading-relaxed text-[var(--muted)]">
                        {a.analytics.startDateHint}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-white/[0.02] text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-3 text-start">{a.analytics.colProduct}</th>
                    <th className="px-4 py-3 text-start">{a.analytics.colUnits}</th>
                    <th className="px-4 py-3 text-start">{a.analytics.colRevenue}</th>
                    <th className="px-4 py-3 text-start">{a.analytics.colCogs}</th>
                    <th className="px-4 py-3 text-start">{a.analytics.colAdSpend}</th>
                    <th className="px-4 py-3 text-start">{a.analytics.colStartDate}</th>
                    <th className="px-4 py-3 text-start">{a.analytics.colNetProfit}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--admin-border)]">
                  {rows.map((row) => {
                    const profit = netProfit(row);
                    return (
                      <tr key={row.productId} className="align-middle">
                        <td className="px-4 py-3">
                          <span className="font-medium text-[var(--foreground)]">
                            {row.name}
                          </span>
                          {row.internalReturns > 0 ? (
                            <span
                              className="ms-2 inline-flex items-center rounded-full border border-slate-400/30 bg-slate-400/10 px-2 py-0.5 text-[10px] font-semibold text-slate-300"
                              title={a.analytics.returnsNote}
                            >
                              {a.analytics.colReturns}: {row.internalReturns}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 tabular-nums" dir="ltr">
                          {row.unitsSold}
                        </td>
                        <td className="px-4 py-3 tabular-nums" dir="ltr">
                          {formatPrice(row.grossRevenue)}
                        </td>
                        <td className="px-4 py-3 tabular-nums" dir="ltr">
                          {row.hasCost ? (
                            formatPrice(row.cogs)
                          ) : (
                            <span className="text-[var(--muted)]">
                              {a.analytics.costMissing}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <AdSpendEditor
                            value={drafts[row.productId] ?? String(row.adSpend)}
                            saving={savingId === row.productId}
                            onChange={(v) =>
                              setDrafts((d) => ({ ...d, [row.productId]: v }))
                            }
                            onSave={() => void onSaveAdSpend(row.productId)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <StartDateEditor
                            value={startDates[row.productId] ?? ""}
                            saving={savingDateId === row.productId}
                            onChange={(v) => void onChangeStartDate(row.productId, v)}
                          />
                        </td>
                        <td className={`px-4 py-3 font-bold tabular-nums ${profitToneClass(profit)}`} dir="ltr">
                          {formatPrice(profit)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function KpiCard({
  label,
  hint,
  value,
  accent,
  emphasizeTone,
}: {
  label: string;
  hint: string;
  value: string;
  accent: "revenue" | "cost" | "ad" | "profit";
  emphasizeTone?: string;
}) {
  const accentBar = {
    revenue: "bg-emerald-500",
    cost: "bg-amber-500",
    ad: "bg-sky-500",
    profit: "bg-[var(--accent)]",
  }[accent];

  return (
    <div className="admin-card relative overflow-hidden p-5">
      <span className={`absolute inset-y-0 start-0 w-1.5 ${accentBar}`} aria-hidden />
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      <p
        className={`mt-3 text-2xl font-bold tabular-nums ${emphasizeTone ?? "text-[var(--foreground)]"}`}
        dir="ltr"
      >
        {value}
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">{hint}</p>
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

function AdSpendEditor({
  value,
  saving,
  onChange,
  onSave,
}: {
  value: string;
  saving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        step="0.01"
        inputMode="decimal"
        dir="ltr"
        disabled={saving}
        value={value}
        placeholder={a.analytics.adSpendPlaceholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSave();
          }
        }}
        className="min-h-[40px] w-28 rounded-xl border border-[var(--accent-muted)] bg-[var(--background)] px-3 py-2 text-sm tabular-nums disabled:opacity-60"
      />
      <button
        type="button"
        disabled={saving}
        onClick={onSave}
        className="min-h-[40px] shrink-0 rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? a.analytics.saving : a.analytics.save}
      </button>
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
    <div className="flex items-center gap-2">
      <input
        type="date"
        dir="ltr"
        disabled={saving}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[40px] w-40 max-w-full rounded-xl border border-[var(--accent-muted)] bg-[var(--background)] px-3 py-2 text-sm tabular-nums disabled:opacity-60"
      />
      {value ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => onChange("")}
          className="min-h-[40px] shrink-0 rounded-xl border border-[var(--admin-border)] px-3 py-2 text-xs font-semibold text-[var(--muted)] transition hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {a.analytics.startDateClear}
        </button>
      ) : null}
    </div>
  );
}
