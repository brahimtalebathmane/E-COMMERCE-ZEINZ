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
import {
  AdminBadge,
  AdminCard,
  AdminEmptyState,
  AdminKpiTile,
  AdminLinkButton,
  AdminPageHeader,
  KPI_ACCENT,
  orderStatusHue,
} from "@/components/admin/ui";

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

function PipelineStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[var(--admin-border)] bg-white/[0.02] px-4 py-3">
      <span className="flex items-center gap-2 text-sm text-[var(--foreground)]">
        <span className={`h-2.5 w-2.5 rounded-full ${tone}`} aria-hidden />
        {label}
      </span>
      <span className="text-base font-bold tabular-nums text-[var(--foreground)]" dir="ltr">
        {value}
      </span>
    </div>
  );
}

export type DashboardVisibility = {
  analytics: boolean;
  orders: boolean;
  products: boolean;
};

export function DashboardHome({
  data,
  visibility,
}: {
  data: DashboardData;
  visibility: DashboardVisibility;
}) {
  return (
    <div className="space-y-6">
      <AdminPageHeader title={a.dashboard.title} subtitle={a.dashboard.subtitle} />

      {(visibility.analytics || visibility.orders) && (
        <section className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {visibility.analytics ? (
            <>
              <AdminKpiTile
                label={a.dashboard.kpiRevenue}
                value={formatPrice(data.grossRevenue)}
                accent={KPI_ACCENT.revenue}
              />
              <AdminKpiTile
                label={a.dashboard.kpiNetProfit}
                value={formatPrice(data.netProfit)}
                accent={KPI_ACCENT.profit}
                emphasize
              />
            </>
          ) : null}
          {visibility.orders ? (
            <>
              <AdminKpiTile
                label={a.dashboard.kpiOrders}
                value={String(data.totalOrders)}
                accent={KPI_ACCENT.orders}
              />
              <AdminKpiTile
                label={a.dashboard.kpiOrdersToday}
                value={String(data.ordersToday)}
                accent={KPI_ACCENT.today}
              />
              <AdminKpiTile
                label={a.dashboard.kpiPending}
                value={String(data.pendingOrders)}
                accent={KPI_ACCENT.pending}
              />
            </>
          ) : null}
          {visibility.products ? (
            <AdminKpiTile
              label={a.dashboard.kpiActiveProducts}
              value={String(data.activeProducts)}
              accent={KPI_ACCENT.products}
            />
          ) : null}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {visibility.orders ? (
          <AdminCard
            title={a.dashboard.recentTitle}
            noPadding
            className="lg:col-span-3"
            action={
              <Link
                href="/admin/orders"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] transition hover:brightness-110"
              >
                {a.dashboard.recentViewAll}
                <ArrowIcon size={14} className="rtl:rotate-180" />
              </Link>
            }
          >
            {data.recentOrders.length === 0 ? (
              <AdminEmptyState title={a.dashboard.recentEmpty} />
            ) : (
              <ul className="divide-y divide-[var(--admin-border)]">
                {data.recentOrders.map((o) => (
                  <li
                    key={o.id}
                    className="flex flex-col gap-2 px-4 py-3 transition hover:bg-white/[0.02] sm:flex-row sm:items-center sm:gap-3 sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium text-[var(--foreground)]">
                        {o.productName}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-xs text-[var(--muted)]" dir="ltr">
                        {o.phone ?? "—"} · {TIME_FORMATTER.format(new Date(o.createdAt))}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <span
                        className="shrink-0 text-sm font-bold tabular-nums text-[var(--foreground)]"
                        dir="ltr"
                      >
                        {formatPrice(o.total)}
                      </span>
                      <AdminBadge hue={orderStatusHue(o.status)} size="sm" className="shrink-0">
                        {a.orderStatus[o.status]}
                      </AdminBadge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </AdminCard>
        ) : null}

        {(visibility.products || visibility.orders || visibility.analytics) && (
          <div className="space-y-6 lg:col-span-2">
            {visibility.products ? (
              <AdminCard title={a.dashboard.pipelineTitle}>
                <div className="space-y-2">
                  <PipelineStat
                    label={a.dashboard.pipelineResearch}
                    value={data.pipeline.research}
                    tone="bg-slate-400"
                  />
                  <PipelineStat
                    label={a.dashboard.pipelineReady}
                    value={data.pipeline.ready}
                    tone="bg-amber-400"
                  />
                  <PipelineStat
                    label={a.dashboard.pipelineWinner}
                    value={data.pipeline.winner}
                    tone="bg-emerald-400"
                  />
                  <PipelineStat
                    label={a.dashboard.pipelineFailed}
                    value={data.pipeline.failed}
                    tone="bg-red-400"
                  />
                </div>
              </AdminCard>
            ) : null}

            <AdminCard title={a.dashboard.quickActions}>
              <div className="grid gap-2">
                {visibility.products ? (
                  <AdminLinkButton href="/admin/products/new" className="w-full">
                    <PlusIcon size={18} />
                    {a.dashboard.quickNewProduct}
                  </AdminLinkButton>
                ) : null}
                {visibility.orders ? (
                  <AdminLinkButton href="/admin/orders" variant="ghost" className="w-full">
                    <OrdersIcon size={18} />
                    {a.dashboard.quickOrders}
                  </AdminLinkButton>
                ) : null}
                {visibility.analytics ? (
                  <AdminLinkButton href="/admin/analytics" variant="ghost" className="w-full">
                    <AnalyticsIcon size={18} />
                    {a.dashboard.quickAnalytics}
                  </AdminLinkButton>
                ) : null}
              </div>
            </AdminCard>
          </div>
        )}
      </div>
    </div>
  );
}
