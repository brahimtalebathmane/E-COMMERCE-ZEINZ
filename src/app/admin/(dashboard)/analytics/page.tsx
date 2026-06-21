import { createClient } from "@/lib/supabase/server";
import { adminAr as a } from "@/locales/admin-ar";
import {
  buildProductProfitRows,
  type ProfitOrderInput,
} from "@/lib/analytics/profit";
import type { OrderStatus } from "@/types";
import { AnalyticsView } from "./AnalyticsView";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  const supabase = await createClient();

  const [ordersRes, productsRes, adSpendRes] = await Promise.all([
    supabase.from("orders").select("product_id, total_price, status"),
    supabase.from("products").select("id, name_ar, cost_price"),
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

  const products = new Map(
    (productsRes.data ?? []).map((p) => [
      String(p.id),
      {
        name: String(p.name_ar ?? "—"),
        costPrice: p.cost_price == null ? null : Number(p.cost_price),
      },
    ]),
  );

  const adSpendByProduct = new Map(
    (adSpendRes.data ?? []).map((r) => [String(r.product_id), Number(r.amount) || 0]),
  );

  const orders: ProfitOrderInput[] = (ordersRes.data ?? []).map((o) => ({
    product_id: String(o.product_id),
    total_price: Number(o.total_price) || 0,
    status: o.status as OrderStatus,
  }));

  const rows = buildProductProfitRows({ orders, products, adSpendByProduct });

  return (
    <div>
      <h1 className="text-2xl font-semibold">{a.analytics.title}</h1>
      <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
        {a.analytics.subtitle}
      </p>
      <AnalyticsView rows={rows} />
    </div>
  );
}
