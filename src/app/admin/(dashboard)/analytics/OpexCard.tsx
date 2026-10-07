"use client";

import { useMemo } from "react";
import { adminAr as a } from "@/locales/admin-ar";
import { formatMoney } from "@/lib/currency";
import { monthRange, type Period } from "@/lib/analytics/period";
import { clipToTreasury, round2, summarizeOpex, type OpexData } from "@/lib/treasury/reconciliation";

const t = a.treasury.opex;

/**
 * Net profit after operating expenses (Phase D). The order net profit comes
 * from the card above (same period, same start dates); only treasury
 * categories counted "opex" are subtracted, from the treasury go-live date.
 */
export function OpexCard({ opex, period, orderNetProfit }: { opex: OpexData; period: Period; orderNetProfit: number }) {
  const range = useMemo(() => clipToTreasury(period, opex.goLiveOn, opex.todayKey), [period, opex]);
  const summary = useMemo(() => summarizeOpex(opex.txns, opex.categories, range), [opex, range]);
  const net = round2(orderNetProfit - summary.total);

  let note: string | null = null;
  if (!range) note = t.beforeGoLive.replace("{date}", opex.goLiveOn);
  else if (period.kind === "month") {
    const full = monthRange(period.month);
    if (range.startKey > full.startKey) {
      note = t.partial
        .replace("{from}", range.startKey)
        .replace("{to}", range.endKey)
        .replace("{date}", opex.goLiveOn);
    }
  }

  return (
    <section className="admin-card p-4 sm:p-5">
      <h2 className="text-base font-semibold text-[var(--foreground)]">{t.title}</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">{t.hint.replace("{date}", opex.goLiveOn)}</p>
      {note ? <p className="mt-2 text-xs text-amber-300">{note}</p> : null}

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--admin-border)] px-4 py-3">
          <dt className="text-xs text-[var(--muted)]">{t.orderNet}</dt>
          <dd className="mt-1 text-lg font-bold tabular-nums" dir="ltr">
            {formatMoney(orderNetProfit, "MRU")}
          </dd>
        </div>
        <div className="rounded-xl border border-[var(--admin-border)] px-4 py-3">
          <dt className="text-xs text-[var(--muted)]">{t.opexTotal}</dt>
          <dd className="mt-1 text-lg font-bold tabular-nums text-red-400" dir="ltr">
            {formatMoney(-summary.total, "MRU")}
          </dd>
        </div>
        <div className="rounded-xl border border-[var(--accent)] px-4 py-3">
          <dt className="text-xs text-[var(--muted)]">{t.netAfterOpex}</dt>
          <dd className={`mt-1 text-lg font-bold tabular-nums ${net < 0 ? "text-red-400" : "text-emerald-400"}`} dir="ltr">
            {formatMoney(net, "MRU")}
          </dd>
        </div>
      </dl>

      {summary.byCategory.length > 0 ? (
        <ul className="mt-4 divide-y divide-[var(--admin-border)] text-sm">
          {summary.byCategory.map((line) => (
            <li key={line.categoryId} className="flex items-center justify-between py-2">
              <span>{line.name}</span>
              <span className="tabular-nums" dir="ltr">
                {formatMoney(-line.amount, "MRU")}
              </span>
            </li>
          ))}
        </ul>
      ) : range ? (
        <p className="mt-4 text-xs text-[var(--muted)]">{t.none}</p>
      ) : null}
    </section>
  );
}
