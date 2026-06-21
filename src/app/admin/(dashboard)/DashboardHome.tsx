import Link from "next/link";
import { adminAr as a } from "@/locales/admin-ar";
import { formatPrice } from "@/lib/currency";
import type { OrderStatus } from "@/types";
import {
  AnalyticsIcon,
  ArrowIcon,
  OrdersIcon,
  PlusIcon,
} from "@/components/admin/AdminIcons";

export type DashboardData = {
  grossRevenue: number;
  netProfit: number;
  totalOrders: number;
  ordersToday: number;
  pendingOrders: number;
  activeProducts: number;
  pipeline: {
    research: number;
    ready: number;
    winner: number;
    failed: number;
  };
  recentOrders: {
    id: string;
    productName: string;
    phone: string | null;
    status: OrderStatus;
    total: number;
    createdAt: string;
  }[];
};

const TIME_FORMATTER = new Intl.DateTimeFormat("ar", {
  timeZone: "Africa/Nouakchott",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function statusBadgeClass(status: OrderStatus): string {
  switch (status) {
    case "pending":
      return "border-amber-400/30 bg-amber-400/10 text-amber-300";
    case "confirmed":
      return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
    case "shipped":
      return "border-sky-400/30 bg-sky-400/10 text-sky-300";
    case "cancelled":
      return "border-red-400/30 bg-red-400/10 text-red-300";
    case "requires_human_intervention":
      return "border-violet-400/30 bg-violet-400/10 text-violet-300";
    case "internal_return":
      return "border-slate-400/30 bg-slate-400/10 text-slate-300";
    default:
      return "border-[var(--admin-border-strong)] bg-white/[0.04] text-[var(--foreground)]";
  }
}

function KpiTile({
  label,
  value,
  accent,
  emphasize,
}: {
  label: string;
  value: string;
  accent: string;
  emphasize?: boolean;
}) {
  return (
    <div className="admin-card relative overflow-hidden p-4 sm:p-5">
      <span
        className="absolute inset-y-0 start-0 w-1"
        style={{ background: accent }}
        aria-hidden
      />
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      <p
        className={`mt-2 text-xl font-bold tabular-nums sm:text-2xl ${
          emphasize
            ? value.trim().startsWith("-")
              ? "text-red-400"
              : "text-emerald-400"
            : "text-[var(--foreground)]"
        }`}
        dir="ltr"
      >
        {value}
      </p>
    </div>
  );
}

function PipelineStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[var(--admin-border)] bg-white/[0.02] px-4 py-3">
      <span className="flex items-center gap-2 text-sm text-[var(--foreground)]">
        <span className={`h-2.5 w-2.5 rounded-full ${tone}`} aria-hidden />
        {label}
      </span>
      <span className="text-base font-bold tabular-nums text-[var(--foreground)]">{value}</span>
    </div>
  );
}

export function DashboardHome({ data }: { data: DashboardData }) {
  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <KpiTile label={a.dashboard.kpiRevenue} value={formatPrice(data.grossRevenue)} accent="#34d399" />
        <KpiTile
          label={a.dashboard.kpiNetProfit}
          value={formatPrice(data.netProfit)}
          accent="var(--accent)"
          emphasize
        />
        <KpiTile label={a.dashboard.kpiOrders} value={String(data.totalOrders)} accent="#38bdf8" />
        <KpiTile label={a.dashboard.kpiOrdersToday} value={String(data.ordersToday)} accent="#a78bfa" />
        <KpiTile label={a.dashboard.kpiPending} value={String(data.pendingOrders)} accent="#fbbf24" />
        <KpiTile label={a.dashboard.kpiActiveProducts} value={String(data.activeProducts)} accent="#f472b6" />
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Recent orders */}
        <section className="admin-card overflow-hidden lg:col-span-3">
          <div className="flex items-center justify-between border-b border-[var(--admin-border)] px-4 py-3.5 sm:px-5">
            <h2 className="text-sm font-bold text-[var(--foreground)]">{a.dashboard.recentTitle}</h2>
            <Link
              href="/admin/orders"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] transition hover:brightness-110"
            >
              {a.dashboard.recentViewAll}
              <ArrowIcon size={14} className="rtl:rotate-180" />
            </Link>
          </div>
          {data.recentOrders.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-[var(--muted)]">
              {a.dashboard.recentEmpty}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--admin-border)]">
              {data.recentOrders.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.02] sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--foreground)]">
                      {o.productName}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-xs text-[var(--muted)]" dir="ltr">
                      {o.phone ?? "—"} · {TIME_FORMATTER.format(new Date(o.createdAt))}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--foreground)]" dir="ltr">
                    {formatPrice(o.total)}
                  </span>
                  <span
                    className={`hidden shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${statusBadgeClass(
                      o.status,
                    )}`}
                  >
                    {a.orderStatus[o.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Pipeline + quick actions */}
        <div className="space-y-6 lg:col-span-2">
          <section className="admin-card p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-bold text-[var(--foreground)]">
              {a.dashboard.pipelineTitle}
            </h2>
            <div className="space-y-2">
              <PipelineStat label={a.dashboard.pipelineResearch} value={data.pipeline.research} tone="bg-slate-400" />
              <PipelineStat label={a.dashboard.pipelineReady} value={data.pipeline.ready} tone="bg-amber-400" />
              <PipelineStat label={a.dashboard.pipelineWinner} value={data.pipeline.winner} tone="bg-emerald-400" />
              <PipelineStat label={a.dashboard.pipelineFailed} value={data.pipeline.failed} tone="bg-red-400" />
            </div>
          </section>

          <section className="admin-card p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-bold text-[var(--foreground)]">
              {a.dashboard.quickActions}
            </h2>
            <div className="grid gap-2">
              <Link href="/admin/products/new" className="admin-btn-primary w-full">
                <PlusIcon size={18} />
                {a.dashboard.quickNewProduct}
              </Link>
              <Link href="/admin/orders" className="admin-btn-ghost w-full">
                <OrdersIcon size={18} />
                {a.dashboard.quickOrders}
              </Link>
              <Link href="/admin/analytics" className="admin-btn-ghost w-full">
                <AnalyticsIcon size={18} />
                {a.dashboard.quickAnalytics}
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
