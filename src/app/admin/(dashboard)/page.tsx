import { createClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/auth/admin";
import { getCountryScope } from "@/lib/auth/country-scope";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { adminAr as a } from "@/locales/admin-ar";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  buildProductProfitRows,
  sumProfitTotals,
  type ProfitOrderInput,
} from "@/lib/analytics/profit";
import type { OrderStatus } from "@/types";
import { DashboardHome, type DashboardData, type DashboardVisibility } from "./DashboardHome";

export const dynamic = "force-dynamic";

const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Nouakchott",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export default async function AdminHomePage() {
  const [session, countryScope] = await Promise.all([getAdminSession(), getCountryScope()]);
  const access = session?.access;
  const canViewOrders = access ? hasPermission(access, PERMISSIONS.view_orders) : false;
  const canViewAnalytics = access ? hasPermission(access, PERMISSIONS.view_analytics) : false;
  const canManageProducts = access ? hasPermission(access, PERMISSIONS.manage_products) : false;
  const canLoadOrders = canViewOrders || canViewAnalytics;
  const { selectedCountryId, selectedCountry } = countryScope;
  const currency = selectedCountry?.currency ?? "MRU";

  const supabase = await createClient();

  // Owned-only, matching /admin/analytics: this KPI is deliberately the
  // owned/MRU business, never affiliate orders (which carry a foreign
  // currency and would otherwise get summed into the MRU total below).
  const productsRes =
    canViewAnalytics || canManageProducts
      ? await supabase
          .from("products")
          .select("id, name_ar, cost_price, test_status, profit_calculation_start_date, deleted_at")
          .eq("country_id", selectedCountryId)
          .eq("fulfillment_type", "owned")
          .is("deleted_at", null)
      : { data: [], error: null };
  if (productsRes.error) {
    return (
      <div>
        <h1 className="text-2xl font-bold">{a.dashboard.title}</h1>
        <p className="mt-4 text-sm text-red-400">
          {a.dashboard.loadError} {productsRes.error.message}
        </p>
      </div>
    );
  }
  const productIds = (productsRes.data ?? []).map((p) => String(p.id));

  const [ordersRes, adSpendRes] = await Promise.all([
    canLoadOrders
      ? fetchAllRows<{
          id: string;
          product_id: string;
          phone: string | null;
          total_price: number;
          status: string;
          created_at: string;
          ordered_at: string;
          delivery_cost: number | null;
          quantity: number | null;
          unit_cost_price: number | null;
          products: { name_ar: string; country_id: string } | { name_ar: string; country_id: string }[] | null;
        }>(
          () =>
            supabase
              .from("orders")
              .select(
                "id, product_id, phone, total_price, status, created_at, ordered_at, delivery_cost, quantity, unit_cost_price, products!inner(name_ar, country_id)",
              )
              .eq("products.country_id", selectedCountryId)
              .in("product_id", productIds) as never,
          "id",
        )
      : Promise.resolve({ rows: [], error: null, truncated: false }),
    // Live ad spend cache (see /admin/analytics, which is the only page that
    // triggers a live Meta refresh) — this home KPI just reads whatever's
    // already cached, no sync call, to keep the home page fast. Constrained to
    // this country's owned product ids so other countries'/affiliate ad spend
    // never leaks in.
    canViewAnalytics
      ? fetchAllRows<{ product_id: string; date: string; amount: number }>(
          () =>
            supabase
              .from("product_ad_spend_daily")
              .select("product_id, date, amount")
              .in("product_id", productIds) as never,
          "date",
        )
      : Promise.resolve({ rows: [], error: null, truncated: false }),
  ]);

  const error = ordersRes.error ?? adSpendRes.error;
  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-bold">{a.dashboard.title}</h1>
        <p className="mt-4 text-sm text-red-400">
          {a.dashboard.loadError} {error}
        </p>
      </div>
    );
  }

  // fetchAllRows orders by `id` (for pagination correctness) — re-sort by
  // business date here, since "recent orders" and "today" both need that.
  const orderRows = [...ordersRes.rows].sort(
    (a, b) => new Date(b.ordered_at).getTime() - new Date(a.ordered_at).getTime(),
  );
  const productRows = productsRes.data ?? [];

  const products = new Map(
    productRows.map((p) => [
      String(p.id),
      {
        name: String(p.name_ar ?? "—"),
        costPrice: p.cost_price == null ? null : Number(p.cost_price),
        calculationStartDate: p.profit_calculation_start_date
          ? String(p.profit_calculation_start_date).slice(0, 10)
          : null,
      },
    ]),
  );
  const adSpendDaily = adSpendRes.rows.map((r) => ({
    product_id: String(r.product_id),
    date: String(r.date),
    amount: Number(r.amount) || 0,
  }));

  let grossRevenue = 0;
  let netProfit = 0;
  let productsMissingCost = 0;
  if (canViewAnalytics) {
    const profitOrders: ProfitOrderInput[] = orderRows.map((o) => ({
      product_id: String(o.product_id),
      total_price: Number(o.total_price) || 0,
      status: o.status as OrderStatus,
      ordered_at: String(o.ordered_at ?? ""),
      delivery_cost: o.delivery_cost == null ? null : Number(o.delivery_cost),
      quantity: o.quantity == null ? 1 : Number(o.quantity),
      unit_cost_price: o.unit_cost_price == null ? null : Number(o.unit_cost_price),
    }));
    const totals = sumProfitTotals(
      buildProductProfitRows({ orders: profitOrders, products, adSpendDaily }),
    );
    grossRevenue = totals.grossRevenue;
    netProfit = totals.netProfit;
    productsMissingCost = totals.productsMissingCost;
  }

  const todayKey = DAY_KEY.format(new Date());
  let ordersToday = 0;
  let pendingOrders = 0;
  for (const o of orderRows) {
    if (DAY_KEY.format(new Date(o.ordered_at as string)) === todayKey) ordersToday += 1;
    if (o.status === "pending") pendingOrders += 1;
  }

  const pipeline = { research: 0, ready: 0, winner: 0, failed: 0 };
  if (canManageProducts) {
    for (const p of productRows) {
      if (p.deleted_at != null) continue;
      const st = p.test_status;
      if (st === "winner") pipeline.winner += 1;
      else if (st === "failed") pipeline.failed += 1;
      else if (st === "ready_for_test" || st === "testing") pipeline.ready += 1;
      else pipeline.research += 1;
    }
  }

  const recentOrders: DashboardData["recentOrders"] = canViewOrders
    ? orderRows.slice(0, 6).map((o) => {
        const product = o.products as { name_ar?: string } | { name_ar?: string }[] | null;
        const name = Array.isArray(product) ? product[0]?.name_ar : product?.name_ar;
        return {
          id: String(o.id),
          productName: String(name ?? a.orders.productUnknown),
          phone: (o.phone as string | null) ?? null,
          status: o.status as OrderStatus,
          total: Number(o.total_price) || 0,
          orderedAt: String(o.ordered_at),
        };
      })
    : [];

  const data: DashboardData = {
    grossRevenue,
    netProfit,
    totalOrders: canViewOrders ? orderRows.length : 0,
    ordersToday: canViewOrders ? ordersToday : 0,
    pendingOrders: canViewOrders ? pendingOrders : 0,
    activeProducts: pipeline.winner,
    pipeline,
    recentOrders,
    productsMissingCost,
  };

  const visibility: DashboardVisibility = {
    analytics: canViewAnalytics,
    orders: canViewOrders,
    products: canManageProducts,
  };

  return (
    <div>
      <DashboardHome data={data} visibility={visibility} currency={currency} />
    </div>
  );
}
