import { formatMoney } from "@/lib/currency";
import { netProfit } from "@/lib/analytics/profit";
import type { AffiliateAnalyticsData } from "./data";

function profitToneClass(value: number): string {
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-red-400";
  return "text-[var(--foreground)]";
}

/**
 * Affiliate (COD Partner) profit, grouped by each product's own currency.
 * Deliberately separate from AnalyticsView's owned/MRU dashboard — amounts
 * here are never summed across currencies or with owned MRU totals.
 */
export function AffiliateAnalyticsSection({ data }: { data: AffiliateAnalyticsData }) {
  if (data.groups.length === 0) return null;

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
        {data.groups.map((group) => (
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
                return (
                  <div
                    key={row.productId}
                    className="rounded-xl border border-[var(--admin-border)] p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-[var(--foreground)]">{row.name}</span>
                      <span className={`font-bold ${profitToneClass(profit)}`} dir="ltr">
                        {formatMoney(profit, row.currency)}
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
                      <Stat label="الإعلانات" value={formatMoney(row.adSpend, row.currency)} />
                      {row.awaitingCosts > 0 ? (
                        <Stat
                          label="بانتظار التكاليف"
                          value={String(row.awaitingCosts)}
                          muted
                        />
                      ) : null}
                    </dl>
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
