import { createClient } from "@/lib/supabase/server";
import { adminAr as a } from "@/locales/admin-ar";
import {
  buildProductProfitRows,
  sumProfitTotals,
  type ProfitOrderInput,
} from "@/lib/analytics/profit";
import type { OrderStatus } from "@/types";
import { DashboardHome, type DashboardData } from "./DashboardHome";

export const dynamic = "force-dynamic";

const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Nouakchott",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export default async function AdminHomePage() {
  const supabase = await createClient();

  const [ordersRes, productsRes, adSpendRes] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, product_id, phone, total_price, status, created_at, products(name_ar)",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("products")
      .select(
        "id, name_ar, cost_price, test_status, profit_calculation_start_date",
      ),
    supabase.from("product_ad_spend").select("product_id, amount"),
  ]);

  const error = ordersRes.error ?? productsRes.error ?? adSpendRes.error;
  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-bold">{a.dashboard.title}</h1>
        <p className="mt-4 text-sm text-red-400">
          {a.dashboard.loadError} {error.message}
        </p>
      </div>
    );
  }

  const orderRows = ordersRes.data ?? [];
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
  const adSpendByProduct = new Map(
    (adSpendRes.data ?? []).map((r) => [String(r.product_id), Number(r.amount) || 0]),
  );
  const profitOrders: ProfitOrderInput[] = orderRows.map((o) => ({
    product_id: String(o.product_id),
    total_price: Number(o.total_price) || 0,
    status: o.status as OrderStatus,
    created_at: String(o.created_at ?? ""),
  }));
  const totals = sumProfitTotals(
    buildProductProfitRows({ orders: profitOrders, products, adSpendByProduct }),
  );

  const todayKey = DAY_KEY.format(new Date());
  let ordersToday = 0;
  let pendingOrders = 0;
  for (const o of orderRows) {
    if (DAY_KEY.format(new Date(o.created_at as string)) === todayKey) ordersToday += 1;
    if (o.status === "pending") pendingOrders += 1;
  }

  const pipeline = { research: 0, ready: 0, winner: 0, failed: 0 };
  for (const p of productRows) {
    const st = p.test_status;
    if (st === "winner") pipeline.winner += 1;
    else if (st === "failed") pipeline.failed += 1;
    else if (st === "ready_for_test" || st === "testing") pipeline.ready += 1;
    else pipeline.research += 1;
  }

  const recentOrders: DashboardData["recentOrders"] = orderRows.slice(0, 6).map((o) => {
    const product = o.products as { name_ar?: string } | { name_ar?: string }[] | null;
    const name = Array.isArray(product)
      ? product[0]?.name_ar
      : product?.name_ar;
    return {
      id: String(o.id),
      productName: String(name ?? a.orders.productUnknown),
      phone: (o.phone as string | null) ?? null,
      status: o.status as OrderStatus,
      total: Number(o.total_price) || 0,
      createdAt: String(o.created_at),
    };
  });

  const data: DashboardData = {
    grossRevenue: totals.grossRevenue,
    netProfit: totals.netProfit,
    totalOrders: orderRows.length,
    ordersToday,
    pendingOrders,
    activeProducts: pipeline.winner,
    pipeline,
    recentOrders,
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold sm:text-2xl">{a.dashboard.greeting}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{a.dashboard.subtitle}</p>
      </div>
      <DashboardHome data={data} />
    </div>
  );
}
