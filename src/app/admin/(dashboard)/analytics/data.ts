import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderStatus } from "@/types";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureFreshAdSpend } from "@/lib/analytics/ad-spend-sync";
import {
  buildProductProfitRows,
  sumProfitTotals,
  type ProductProfitRow,
  type ProfitOrderInput,
  type ProfitTotals,
} from "@/lib/analytics/profit";
import {
  buildDailyProfitSeries,
  combineAcrossProducts,
  computeSummary,
  dayKey,
  type CombinedDailyProfit,
  type DailyProductProfit,
  type DashboardSummary,
} from "@/lib/analytics/daily-profit";

export type ProductMetaInput = {
  productId: string;
  name: string;
  costPrice: number | null;
  calculationStartDate: string | null;
  createdAt: string;
};

export type LinkedCampaign = { id: string; metaCampaignId: string; label: string | null };

export type AnalyticsData = {
  rows: ProductProfitRow[];
  totals: ProfitTotals;
  /** Raw shipped-order-relevant orders, so the client can instantly recompute
   * `rows` when a product's calculation-start-date changes, without waiting
   * on a full page reload. */
  orders: ProfitOrderInput[];
  daily: DailyProductProfit[];
  combined: CombinedDailyProfit[];
  summary: DashboardSummary;
  products: ProductMetaInput[];
  campaignsByProduct: Map<string, LinkedCampaign[]>;
  /** Most recent `fetched_at` per product with any cached ad-spend row (for the "as of" note). */
  adSpendFetchedAtByProduct: Map<string, string>;
  adSpendFreshness: { refreshed: boolean; lastError?: string };
  todayKey: string;
};

export type LoadAnalyticsResult = { ok: true; data: AnalyticsData } | { ok: false; error: string };

/**
 * Shared data loader for `/admin/analytics` and `/admin/analytics/[productId]`.
 * Reads go through the caller's (cookie/RLS-scoped) client; the live ad-spend
 * refresh (`ensureFreshAdSpend`) runs on its own service-role client since it
 * writes to `product_ad_spend_daily`, which has no client-writable RLS policy.
 */
export async function loadAnalyticsData(cookieClient: SupabaseClient): Promise<LoadAnalyticsResult> {
  const [productsRes, campaignsRes] = await Promise.all([
    cookieClient
      .from("products")
      .select("id, name_ar, cost_price, profit_calculation_start_date, created_at"),
    cookieClient.from("product_ad_campaigns").select("id, product_id, meta_campaign_id, label"),
  ]);

  if (productsRes.error) return { ok: false, error: productsRes.error.message };
  if (campaignsRes.error) return { ok: false, error: campaignsRes.error.message };

  const productRows = productsRes.data ?? [];
  const campaignRows = campaignsRes.data ?? [];

  const freshness = await ensureFreshAdSpend(
    createServiceClient(),
    productRows.map((p) => ({ id: String(p.id), createdAt: String(p.created_at ?? "") })),
  );

  const [ordersRes, adSpendDailyRes] = await Promise.all([
    cookieClient
      .from("orders")
      .select("product_id, total_price, status, created_at, delivery_cost, quantity"),
    cookieClient.from("product_ad_spend_daily").select("product_id, date, amount, fetched_at"),
  ]);

  if (ordersRes.error) return { ok: false, error: ordersRes.error.message };
  if (adSpendDailyRes.error) return { ok: false, error: adSpendDailyRes.error.message };

  const products: ProductMetaInput[] = productRows.map((p) => ({
    productId: String(p.id),
    name: String(p.name_ar ?? "—"),
    costPrice: p.cost_price == null ? null : Number(p.cost_price),
    calculationStartDate: p.profit_calculation_start_date
      ? String(p.profit_calculation_start_date).slice(0, 10)
      : null,
    createdAt: String(p.created_at ?? ""),
  }));

  const productMetaMap = new Map(
    products.map((p) => [
      p.productId,
      { name: p.name, costPrice: p.costPrice, calculationStartDate: p.calculationStartDate },
    ]),
  );

  const adSpendDaily = (adSpendDailyRes.data ?? []).map((r) => ({
    product_id: String(r.product_id),
    date: String(r.date),
    amount: Number(r.amount) || 0,
  }));

  const adSpendByProduct = new Map<string, number>();
  const adSpendFetchedAtByProduct = new Map<string, string>();
  for (const r of adSpendDailyRes.data ?? []) {
    const productId = String(r.product_id);
    adSpendByProduct.set(productId, (adSpendByProduct.get(productId) ?? 0) + (Number(r.amount) || 0));
    const fetchedAt = String(r.fetched_at ?? "");
    const current = adSpendFetchedAtByProduct.get(productId);
    if (fetchedAt && (!current || fetchedAt > current)) {
      adSpendFetchedAtByProduct.set(productId, fetchedAt);
    }
  }

  const orders: ProfitOrderInput[] = (ordersRes.data ?? []).map((o) => ({
    product_id: String(o.product_id),
    total_price: Number(o.total_price) || 0,
    status: o.status as OrderStatus,
    created_at: String(o.created_at ?? ""),
    delivery_cost: o.delivery_cost == null ? null : Number(o.delivery_cost),
    quantity: o.quantity == null ? 1 : Number(o.quantity),
  }));

  const rows = buildProductProfitRows({ orders, products: productMetaMap, adSpendByProduct });
  const totals = sumProfitTotals(rows);

  const daily = buildDailyProfitSeries({ orders, products: productMetaMap, adSpendDaily });
  const combined = combineAcrossProducts(daily);
  const todayKey = dayKey(new Date());

  const summary = computeSummary({
    daily,
    combined,
    products: new Map(products.map((p) => [p.productId, { name: p.name, createdAt: p.createdAt }])),
    todayKey,
  });

  const campaignsByProduct = new Map<string, LinkedCampaign[]>();
  for (const c of campaignRows) {
    const pid = String(c.product_id);
    const list = campaignsByProduct.get(pid) ?? [];
    list.push({ id: String(c.id), metaCampaignId: String(c.meta_campaign_id), label: c.label ?? null });
    campaignsByProduct.set(pid, list);
  }

  return {
    ok: true,
    data: {
      rows,
      totals,
      orders,
      daily,
      combined,
      summary,
      products,
      campaignsByProduct,
      adSpendFetchedAtByProduct,
      adSpendFreshness: freshness,
      todayKey,
    },
  };
}
