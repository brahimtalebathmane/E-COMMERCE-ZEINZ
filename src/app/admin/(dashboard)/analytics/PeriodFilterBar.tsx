"use client";

import { useMemo } from "react";
import { adminAr as a } from "@/locales/admin-ar";
import { dayKey } from "@/lib/analytics/daily-profit";
import { monthKeyOf, previousMonth, type Period } from "@/lib/analytics/period";

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("ar", { month: "long", year: "numeric" });

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return MONTH_LABEL_FORMATTER.format(new Date(Date.UTC(y, m - 1, 1)));
}

type Props = {
  period: Period;
  /** YYYY-MM keys that actually have data, newest first — only these populate the free-form picker. */
  monthsWithData: string[];
  onChange: (period: Period) => void;
  syncing: boolean;
};

export function PeriodFilterBar({ period, monthsWithData, onChange, syncing }: Props) {
  const thisMonthKey = useMemo(() => monthKeyOf(dayKey(new Date())), []);
  const lastMonthKey = useMemo(() => previousMonth(thisMonthKey), [thisMonthKey]);

  const isAll = period.kind === "all";
  const isThisMonth = period.kind === "month" && period.month === thisMonthKey;
  const isLastMonth = period.kind === "month" && period.month === lastMonthKey;
  const pickedMonth = period.kind === "month" ? period.month : "";

  function segClass(active: boolean): string {
    return `px-3 py-1.5 text-xs font-semibold transition ${
      active
        ? "bg-[var(--accent)] text-white"
        : "bg-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
    }`;
  }

  return (
    <section className="admin-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-[var(--accent-muted)]">
          <button type="button" className={segClass(isAll)} onClick={() => onChange({ kind: "all" })}>
            {a.analytics.periodAll}
          </button>
          <button
            type="button"
            className={segClass(isThisMonth)}
            onClick={() => onChange({ kind: "month", month: thisMonthKey })}
          >
            {a.analytics.periodThisMonth}
          </button>
          <button
            type="button"
            className={segClass(isLastMonth)}
            onClick={() => onChange({ kind: "month", month: lastMonthKey })}
          >
            {a.analytics.periodLastMonth}
          </button>
        </div>

        {monthsWithData.length > 0 ? (
          <select
            value={pickedMonth}
            onChange={(e) => {
              const value = e.target.value;
              if (value) onChange({ kind: "month", month: value });
              else onChange({ kind: "all" });
            }}
            className="admin-input w-full !text-xs sm:w-auto"
            aria-label={a.analytics.periodPickMonth}
          >
            <option value="">{a.analytics.periodPickMonth}</option>
            {monthsWithData.map((month) => (
              <option key={month} value={month}>
                {monthLabel(month)}
              </option>
            ))}
          </select>
        ) : null}

        {syncing ? (
          <span className="text-xs text-[var(--muted)]">{a.analytics.periodSyncing}</span>
        ) : null}
      </div>
    </section>
  );
}

export { monthLabel };
