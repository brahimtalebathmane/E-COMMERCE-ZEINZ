"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { adminAr as a } from "@/locales/admin-ar";
import { dayKey, type AdSpendDailyInput } from "@/lib/analytics/daily-profit";
import { listMonthsWithData, type Period } from "@/lib/analytics/period";
import { AnalyticsView } from "./AnalyticsView";
import { AffiliateAnalyticsSection } from "./AffiliateAnalyticsSection";
import { PeriodFilterBar } from "./PeriodFilterBar";
import type { AnalyticsData, AffiliateAnalyticsData } from "./data";
import { ensureMonthAdSpendAction } from "./actions";

const MONTH_RE = /^\d{4}-\d{2}$/;

function parseInitialPeriod(raw: string | undefined): Period {
  if (raw && MONTH_RE.test(raw) && !Number.isNaN(new Date(`${raw}-01T00:00:00Z`).getTime())) {
    return { kind: "month", month: raw };
  }
  return { kind: "all" };
}

/**
 * Updates the address bar to reflect the selected period WITHOUT going
 * through Next's router — `router.replace` re-renders/re-fetches the server
 * component tree whenever `searchParams` changes, which would refetch orders
 * on every period switch. `history.replaceState` only updates the URL (for
 * refresh/share), leaving the already-loaded client data untouched.
 */
function syncPeriodToUrl(period: Period) {
  const url = new URL(window.location.href);
  if (period.kind === "all") url.searchParams.delete("period");
  else url.searchParams.set("period", period.month);
  window.history.replaceState(window.history.state, "", url.toString());
}

export function AnalyticsPageClient({
  data,
  affiliateData,
  initialPeriod,
}: {
  data: AnalyticsData;
  affiliateData: AffiliateAnalyticsData | null;
  initialPeriod?: string;
}) {
  const [period, setPeriod] = useState<Period>(() => parseInitialPeriod(initialPeriod));
  const [extraAdSpendDaily, setExtraAdSpendDaily] = useState<Record<string, AdSpendDailyInput[]>>({});
  const [syncingMonth, setSyncingMonth] = useState<string | null>(null);
  const [incompleteMonths, setIncompleteMonths] = useState<Record<string, boolean>>({});
  const requestedMonthsRef = useRef<Set<string>>(new Set());

  const monthsWithData = useMemo(() => {
    const ownedOrderKeys = data.orders.map((o) => dayKey(o.ordered_at));
    const ownedAdSpendKeys = data.adSpendDaily.map((r) => r.date);
    const affiliateOrderKeys = (affiliateData?.orders ?? []).map((o) => dayKey(o.ordered_at));
    const affiliateAdSpendKeys = (affiliateData?.adSpendDaily ?? []).map((r) => r.date);
    return listMonthsWithData([
      ...ownedOrderKeys,
      ...ownedAdSpendKeys,
      ...affiliateOrderKeys,
      ...affiliateAdSpendKeys,
    ]);
  }, [data.orders, data.adSpendDaily, affiliateData]);

  function onPeriodChange(next: Period) {
    setPeriod(next);
    syncPeriodToUrl(next);
  }

  useEffect(() => {
    if (period.kind !== "month") return;
    const month = period.month;
    if (requestedMonthsRef.current.has(month)) return;
    requestedMonthsRef.current.add(month);

    let cancelled = false;
    setSyncingMonth(month);
    void ensureMonthAdSpendAction(month)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) return;
        setExtraAdSpendDaily((cur) => ({
          ...cur,
          [month]: res.adSpendDaily.map((r) => ({ product_id: r.product_id, date: r.date, amount: r.amount })),
        }));
        setIncompleteMonths((cur) => ({ ...cur, [month]: res.incompleteProductIds.length > 0 }));
      })
      .finally(() => {
        if (!cancelled) setSyncingMonth((cur) => (cur === month ? null : cur));
      });

    return () => {
      cancelled = true;
    };
  }, [period]);

  const ownedAdSpendDaily = useMemo(() => {
    const extra = period.kind === "month" ? extraAdSpendDaily[period.month] : undefined;
    return extra ? [...data.adSpendDaily, ...extra] : data.adSpendDaily;
  }, [data.adSpendDaily, extraAdSpendDaily, period]);

  const affiliateAdSpendDaily = useMemo(() => {
    const base = affiliateData?.adSpendDaily ?? [];
    const extra = period.kind === "month" ? extraAdSpendDaily[period.month] : undefined;
    return extra ? [...base, ...extra] : base;
  }, [affiliateData, extraAdSpendDaily, period]);

  const showIncompleteNote = period.kind === "month" && Boolean(incompleteMonths[period.month]);

  return (
    <div className="space-y-8">
      <PeriodFilterBar
        period={period}
        monthsWithData={monthsWithData}
        onChange={onPeriodChange}
        syncing={syncingMonth !== null}
      />
      {showIncompleteNote ? (
        <p className="rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-xs text-amber-300">
          {a.analytics.periodAdSpendIncomplete}
        </p>
      ) : null}

      <AnalyticsView data={data} period={period} adSpendDaily={ownedAdSpendDaily} />
      {affiliateData ? (
        <AffiliateAnalyticsSection
          data={{ ...affiliateData, adSpendDaily: affiliateAdSpendDaily }}
          period={period}
        />
      ) : null}
    </div>
  );
}
