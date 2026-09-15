"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { adminAr as a } from "@/locales/admin-ar";
import { formatPrice } from "@/lib/currency";
import { dayKey, type AdSpendDailyInput } from "@/lib/analytics/daily-profit";
import {
  countUnparseableOrderDates,
  dedupeAdSpendDaily,
  listMonthsWithData,
  type Period,
} from "@/lib/analytics/period";
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
  const [extraOwnedAdSpendDaily, setExtraOwnedAdSpendDaily] = useState<Record<string, AdSpendDailyInput[]>>({});
  const [extraAffiliateAdSpendDaily, setExtraAffiliateAdSpendDaily] = useState<
    Record<string, AdSpendDailyInput[]>
  >({});
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
        setExtraOwnedAdSpendDaily((cur) => ({
          ...cur,
          [month]: res.ownedAdSpendDaily.map((r) => ({ product_id: r.product_id, date: r.date, amount: r.amount })),
        }));
        setExtraAffiliateAdSpendDaily((cur) => ({
          ...cur,
          [month]: res.affiliateAdSpendDaily.map((r) => ({ product_id: r.product_id, date: r.date, amount: r.amount })),
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

  // Deduped: `ensureMonthAdSpendAction` returns the WHOLE month window
  // (cached rows included), and `data.adSpendDaily` already has those same
  // rows from the initial server load — concatenating without deduping
  // double-counts every revisited month's ad spend (A1). Later (freshly
  // synced) rows win over the initial load's cached ones.
  const ownedAdSpendDaily = useMemo(() => {
    const extra = period.kind === "month" ? extraOwnedAdSpendDaily[period.month] : undefined;
    return extra ? dedupeAdSpendDaily([...data.adSpendDaily, ...extra]) : data.adSpendDaily;
  }, [data.adSpendDaily, extraOwnedAdSpendDaily, period]);

  const affiliateAdSpendDaily = useMemo(() => {
    const base = affiliateData?.adSpendDaily ?? [];
    const extra = period.kind === "month" ? extraAffiliateAdSpendDaily[period.month] : undefined;
    return extra ? dedupeAdSpendDaily([...base, ...extra]) : base;
  }, [affiliateData, extraAffiliateAdSpendDaily, period]);

  const showIncompleteNote = period.kind === "month" && Boolean(incompleteMonths[period.month]);

  // C1: a compact strip of specific, countable data-quality facts, shown only
  // when there is something to say — never a bare number with a known defect
  // behind it and no explanation.
  const unparseableOwned = useMemo(
    () => countUnparseableOrderDates(data.orders, period),
    [data.orders, period],
  );
  const unparseableAffiliate = useMemo(
    () => countUnparseableOrderDates(affiliateData?.orders ?? [], period),
    [affiliateData, period],
  );
  const unparseableTotal = unparseableOwned + unparseableAffiliate;
  const truncated = data.truncated || Boolean(affiliateData?.truncated);
  const productsMissingCost = data.totals.productsMissingCost;
  const revenueMissingCost = data.totals.revenueMissingCost;

  const strip: { key: string; text: string; tone: "amber" | "red" }[] = [];
  if (truncated) {
    strip.push({
      key: "truncated",
      text: a.analytics.dataQualityTruncated,
      tone: "red",
    });
  }
  if (productsMissingCost > 0) {
    strip.push({
      key: "missingCost",
      text: a.analytics.dataQualityMissingCost
        .replace("{count}", String(productsMissingCost))
        .replace("{revenue}", formatPrice(revenueMissingCost)),
      tone: "amber",
    });
  }
  if (showIncompleteNote) {
    strip.push({ key: "adSpendIncomplete", text: a.analytics.periodAdSpendIncomplete, tone: "amber" });
  }
  if (unparseableTotal > 0) {
    strip.push({
      key: "unparseableDates",
      text: a.analytics.dataQualityUnparseableDates.replace("{count}", String(unparseableTotal)),
      tone: "amber",
    });
  }

  return (
    <div className="space-y-8">
      <PeriodFilterBar
        period={period}
        monthsWithData={monthsWithData}
        onChange={onPeriodChange}
        syncing={syncingMonth !== null}
      />
      {strip.length > 0 ? (
        <div className="space-y-2">
          {strip.map((item) => (
            <p
              key={item.key}
              className={
                item.tone === "red"
                  ? "rounded-xl border border-red-400/30 bg-red-400/5 px-4 py-3 text-xs font-semibold text-red-300"
                  : "rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-xs text-amber-300"
              }
            >
              {item.text}
            </p>
          ))}
        </div>
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
