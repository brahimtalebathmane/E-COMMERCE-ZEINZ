import { createClient } from "@/lib/supabase/server";
import { adminAr as a } from "@/locales/admin-ar";
import type { ProfitOrderInput } from "@/lib/analytics/profit";
import type { OrderStatus } from "@/types";
import { AnalyticsView, type ProductMetaInput } from "./AnalyticsView";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  const supabase = await createClient();

  const [ordersRes, productsRes, adSpendRes] = await Promise.all([
    supabase.from("orders").select("product_id, total_price, status, created_at"),
    supabase
      .from("products")
      .select("id, name_ar, cost_price, profit_calculation_start_date"),
    supabase.from("product_ad_spend").select("product_id, amount"),
  ]);

  const error = ordersRes.error ?? productsRes.error ?? adSpendRes.error;
  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">{a.analytics.title}</h1>
        <p className="mt-4 text-sm text-red-600">
          {a.orders.loadError} {error.message}
        </p>
      </div>
    );
  }

  const products: ProductMetaInput[] = (productsRes.data ?? []).map((p) => ({
    productId: String(p.id),
    name: String(p.name_ar ?? "—"),
    costPrice: p.cost_price == null ? null : Number(p.cost_price),
    calculationStartDate: p.profit_calculation_start_date
      ? String(p.profit_calculation_start_date).slice(0, 10)
      : null,
  }));

  const adSpend: Record<string, number> = Object.fromEntries(
    (adSpendRes.data ?? []).map((r) => [String(r.product_id), Number(r.amount) || 0]),
  );

  const orders: ProfitOrderInput[] = (ordersRes.data ?? []).map((o) => ({
    product_id: String(o.product_id),
    total_price: Number(o.total_price) || 0,
    status: o.status as OrderStatus,
    created_at: String(o.created_at ?? ""),
  }));

  return (
    <AnalyticsView orders={orders} products={products} adSpend={adSpend} />
  );
}
