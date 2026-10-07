import Link from "next/link";
import { adminAr as a } from "@/locales/admin-ar";
import { AdminCard, AdminPageHeader } from "@/components/admin/ui";
import { formatMoney } from "@/lib/currency";
import { getAdminSession } from "@/lib/auth/admin";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { dayKey } from "@/lib/analytics/daily-profit";
import { monthKeyOf, previousMonth, type Period } from "@/lib/analytics/period";
import { clipToTreasury } from "@/lib/treasury/reconciliation";
import { loadReconciliation, type ReconciliationReport } from "@/lib/treasury/reconciliation-data";
import { getTreasuryPageContext } from "../context";
import { TreasuryTabs } from "../TreasuryTabs";

export const dynamic = "force-dynamic";

const r = a.treasury.reconciliation;
const MONTH_RE = /^\d{4}-\d{2}$/;

function money(value: number) {
  return (
    <span className={`tabular-nums ${value < 0 ? "text-red-400" : ""}`} dir="ltr">
      {formatMoney(value, "MRU")}
    </span>
  );
}

function Row({ label, value, strong, hint }: { label: string; value: number; strong?: boolean; hint?: string }) {
  return (
    <li className={`flex items-start justify-between gap-3 py-2 ${strong ? "font-bold" : ""}`}>
      <span>
        {label}
        {hint ? <span className="mt-0.5 block text-xs font-normal text-[var(--muted)]">{hint}</span> : null}
      </span>
      {money(value)}
    </li>
  );
}

/** Months from the go-live month to the current one, newest first. */
function monthsSince(goLiveOn: string, todayKey: string): string[] {
  const out: string[] = [];
  const first = monthKeyOf(goLiveOn);
  for (let m = monthKeyOf(todayKey); m >= first && out.length < 36; m = previousMonth(m)) out.push(m);
  return out;
}

export default async function TreasuryReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const ctx = await getTreasuryPageContext();
  if (!ctx.ok || !ctx.goLive) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={r.title} />
        <p className="admin-alert-error">{!ctx.ok ? a.treasury.onlyLocal : a.treasury.notLiveTitle}</p>
      </div>
    );
  }
  const session = await getAdminSession();
  if (!session || !hasPermission(session.access, PERMISSIONS.view_analytics)) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={r.title} />
        <TreasuryTabs />
        <p className="admin-alert-error">{r.requiresAnalytics}</p>
      </div>
    );
  }

  const todayKey = dayKey(new Date());
  const { period: raw } = await searchParams;
  const period: Period =
    raw === "all" ? { kind: "all" } : { kind: "month", month: raw && MONTH_RE.test(raw) ? raw : monthKeyOf(todayKey) };
  const range = clipToTreasury(period, ctx.goLive.goLiveOn, todayKey);
  const months = monthsSince(ctx.goLive.goLiveOn, todayKey);

  let report: ReconciliationReport | null = null;
  let loadError: string | null = null;
  if (range) {
    try {
      report = await loadReconciliation(ctx.service, ctx.countryId, ctx.goLive.goLiveOn, range);
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  }

  const chip = (href: string, label: string, active: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-muted)]/30 text-[var(--foreground)]"
          : "border-[var(--admin-border)] text-[var(--muted)] hover:text-[var(--foreground)]"
      }`}
      dir="ltr"
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-5">
      <AdminPageHeader title={r.title} subtitle={r.subtitle} />
      <TreasuryTabs />

      <nav className="flex flex-wrap gap-2">
        {chip("/admin/treasury/reconciliation?period=all", r.periodAll, period.kind === "all")}
        {months.map((m) =>
          chip(`/admin/treasury/reconciliation?period=${m}`, m, period.kind === "month" && period.month === m),
        )}
      </nav>

      {!range ? <p className="admin-alert-error">{r.beforeGoLive}</p> : null}
      {loadError ? (
        <p className="admin-alert-error">
          {r.loadError} {loadError}
        </p>
      ) : null}

      {report ? <Report report={report} period={period} /> : null}
    </div>
  );
}

function Report({ report, period }: { report: ReconciliationReport; period: Period }) {
  const { bridge, revenue, flags } = report;
  const clipped = period.kind === "all" || report.range.startKey !== `${period.month}-01`;
  const adsLine = bridge.lines.find((l) => l.key === "ads")?.amount ?? 0;
  const flagItems: string[] = [];
  if (flags.missingDeliveryCost.length > 0) {
    flagItems.push(r.flagMissingDelivery.replace("{count}", String(flags.missingDeliveryCost.length)));
  }
  if (flags.missingCostProducts.length > 0) {
    flagItems.push(r.flagMissingCost.replace("{names}", flags.missingCostProducts.join("، ")));
  }
  if (flags.productsWithoutCampaign.length > 0) {
    flagItems.push(r.flagNoCampaign.replace("{names}", flags.productsWithoutCampaign.join("، ")));
  }
  if (flags.outsideTreasury.length > 0) {
    flagItems.push(r.flagOutside.replace("{count}", String(flags.outsideTreasury.length)));
  }
  if (Math.abs(adsLine) >= 1) {
    flagItems.push(r.flagAdsGap.replace("{amount}", formatMoney(adsLine, "MRU")));
  }

  return (
    <>
      <p className="text-xs text-[var(--muted)]" dir="rtl">
        <span dir="ltr">{r.range.replace("{from}", report.range.startKey).replace("{to}", report.range.endKey)}</span>
        {clipped ? ` — ${r.rangeClipped.replace("{date}", report.goLiveOn)}` : null} {r.adSpendNote}
      </p>

      <div className="grid gap-5 lg:grid-cols-2">
        <AdminCard title={r.bridgeTitle}>
          <p className="text-xs text-[var(--muted)]">{r.bridgeHint}</p>
          <ul className="mt-3 divide-y divide-[var(--admin-border)] text-sm">
            <Row label={r.orderNet} value={bridge.orderNetProfit} />
            <Row label={r.opex} value={-bridge.opex} />
            <Row label={r.netAfterOpex} value={bridge.netAfterOpex} strong />
            {bridge.lines.map((l) => (
              <Row key={l.key} label={r.lines[l.key]} value={l.amount} />
            ))}
            <Row label={r.cashChange} value={bridge.cashChange} strong />
            {bridge.unexplained !== 0 ? (
              <Row label={r.unexplained} value={bridge.unexplained} strong hint={r.unexplainedHint} />
            ) : null}
          </ul>
        </AdminCard>

        <AdminCard title={r.revenueTitle}>
          <p className="text-xs text-[var(--muted)]">{r.revenueHint.replace("{count}", String(report.profit.ordersCount))}</p>
          <ul className="mt-3 divide-y divide-[var(--admin-border)] text-sm">
            <Row label={r.shippedRevenue} value={report.profit.grossRevenue} strong />
            <Row label={`${r.settled} (${revenue.settled.count})`} value={revenue.settled.amount} />
            <Row label={`${r.withAgents} (${revenue.withAgents.count})`} value={revenue.withAgents.amount} />
            {revenue.outside.count > 0 ? (
              <Row label={`${r.outside} (${revenue.outside.count})`} value={revenue.outside.amount} />
            ) : null}
            {report.unlinkedSales.count > 0 ? (
              <Row
                label={r.unlinkedSales}
                value={report.unlinkedSales.amount}
                hint={r.unlinkedSalesHint.replace("{count}", String(report.unlinkedSales.count))}
              />
            ) : null}
          </ul>
        </AdminCard>

        <AdminCard title={r.opexTitle}>
          {report.opex.byCategory.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">{a.treasury.opex.none}</p>
          ) : (
            <ul className="divide-y divide-[var(--admin-border)] text-sm">
              {report.opex.byCategory.map((l) => (
                <Row key={l.categoryId} label={l.name} value={-l.amount} />
              ))}
              <Row label={a.treasury.total} value={-report.opex.total} strong />
            </ul>
          )}
        </AdminCard>

        <AdminCard title={r.agentsTitle}>
          {report.agents.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">{a.treasury.noAgents}</p>
          ) : (
            <ul className="divide-y divide-[var(--admin-border)] text-sm">
              {report.agents.map((ag) => (
                <li key={ag.partyId ?? "none"} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    {ag.partyId ? (
                      <Link href={`/admin/treasury/parties/${ag.partyId}`} className="underline-offset-2 hover:underline">
                        {ag.name}
                      </Link>
                    ) : (
                      a.treasury.unassigned
                    )}
                    <span className="mt-0.5 block text-xs text-[var(--muted)]">
                      {a.treasury.agentOrders.replace("{count}", String(ag.unsettledOrders))}
                      {ag.returnsAwaitingFee > 0
                        ? ` · ${a.treasury.agentReturns.replace("{count}", String(ag.returnsAwaitingFee))}`
                        : ""}
                    </span>
                  </span>
                  {money(ag.cashHeld)}
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      </div>

      <AdminCard title={r.flagsTitle}>
        {flagItems.length === 0 ? (
          <p className="text-sm text-emerald-400">{r.noFlags}</p>
        ) : (
          <ul className="space-y-2 text-sm text-amber-300">
            {flagItems.map((f) => (
              <li key={f}>⚠ {f}</li>
            ))}
          </ul>
        )}
        {flags.missingDeliveryCost.length > 0 ? (
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-[var(--muted)]">{r.showOrders}</summary>
            <ul className="mt-2 space-y-1" dir="ltr">
              {flags.missingDeliveryCost.slice(0, 50).map((o) => (
                <li key={o.id}>
                  {dayKey(o.orderedAt)} · #{o.id.slice(0, 8)} · {o.productName} · {formatMoney(o.totalPrice, "MRU")}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </AdminCard>
    </>
  );
}
