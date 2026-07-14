import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { adminAr as a } from "@/locales/admin-ar";
import type { ProductProfitRow } from "@/lib/analytics/profit";
import { loadAnalyticsData } from "../data";
import { ProductAnalyticsView } from "./ProductAnalyticsView";

export const dynamic = "force-dynamic";

export default async function ProductAnalyticsPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const supabase = await createClient();
  const result = await loadAnalyticsData(supabase);

  if (!result.ok) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">{a.analytics.title}</h1>
        <p className="mt-4 text-sm text-red-600">
          {a.orders.loadError} {result.error}
        </p>
      </div>
    );
  }

  const { data } = result;
  const productMeta = data.products.find((p) => p.productId === productId);

  if (!productMeta) {
    return (
      <div>
        <p className="text-sm">
          <Link
            href="/admin/analytics"
            className="text-[var(--accent)] underline-offset-2 hover:underline"
          >
            {a.analytics.backToAnalytics}
          </Link>
        </p>
        <p className="mt-4 text-sm text-red-600">{a.analytics.productNotFound}</p>
      </div>
    );
  }

  // A product with zero orders and zero ad spend has no row from
  // `buildProductProfitRows` (it only creates rows for products with
  // activity) — synthesize an empty one rather than treating that as "not found".
  const row: ProductProfitRow =
    data.rows.find((r) => r.productId === productId) ?? {
      productId,
      name: productMeta.name,
      costPrice: productMeta.costPrice ?? 0,
      unitsSold: 0,
      grossRevenue: 0,
      cogs: 0,
      deliveryCost: 0,
      adSpend: 0,
      internalReturns: 0,
      hasCost: productMeta.costPrice != null,
      calculationStartDate: productMeta.calculationStartDate,
    };

  const productDaily = data.daily.filter((d) => d.productId === productId);

  return (
    <div>
      <p className="text-sm">
        <Link
          href="/admin/analytics"
          className="text-[var(--accent)] underline-offset-2 hover:underline"
        >
          {a.analytics.backToAnalytics}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold">{row.name}</h1>
      <ProductAnalyticsView
        row={row}
        productDaily={productDaily}
        overallAvgDailyNetProfit={data.summary.avg30d}
        createdAt={productMeta.createdAt}
        todayKey={data.todayKey}
      />
    </div>
  );
}
