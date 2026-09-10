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
  type AdSpendDailyInput,
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
  /** Raw per-day, per-product ad spend (the same rows `daily` was built from),
   * exposed so the client can rebuild a period-scoped ad-spend map instead of
   * the life-to-date one baked into `rows`/`daily`. */
  adSpendDaily: AdSpendDailyInput[];
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
export async function loadAnalyticsData(
  cookieClient: SupabaseClient,
  countryId?: string,
): Promise<LoadAnalyticsResult> {
  let ownedProductsQuery = cookieClient
    .from("products")
    // Owned-only: affiliate products/orders are excluded from this whole
    // pipeline (including the combined daily chart) so their non-MRU
    // amounts are never summed alongside MRU. See loadAffiliateAnalyticsData.
    .select("id, name_ar, cost_price, profit_calculation_start_date, created_at")
    .eq("fulfillment_type", "owned");
  if (countryId) ownedProductsQuery = ownedProductsQuery.eq("country_id", countryId);

  const [productsRes, campaignsRes] = await Promise.all([
    ownedProductsQuery,
    cookieClient.from("product_ad_campaigns").select("id, product_id, meta_campaign_id, label"),
  ]);

  if (productsRes.error) return { ok: false, error: productsRes.error.message };
  if (campaignsRes.error) return { ok: false, error: campaignsRes.error.message };

  const productRows = productsRes.data ?? [];
  const campaignRows = campaignsRes.data ?? [];
  const ownedProductIds = new Set(productRows.map((p) => String(p.id)));

  // ensureFreshAdSpend WRITES to product_ad_spend_daily, so the read of that
  // same table below must wait for it to finish (otherwise the read can race
  // ahead and return stale data) — but it doesn't touch `orders` at all, so
  // that fetch is genuinely independent and can run alongside it.
  const [ordersRes, freshness] = await Promise.all([
    cookieClient
      .from("orders")
      .select(
        "product_id, total_price, status, ordered_at, delivery_cost, quantity, unit_cost_price",
      ),
    ensureFreshAdSpend(
      createServiceClient(),
      productRows.map((p) => ({ id: String(p.id), createdAt: String(p.created_at ?? "") })),
    ),
  ]);

  if (ordersRes.error) return { ok: false, error: ordersRes.error.message };

  const adSpendDailyRes = await cookieClient
    .from("product_ad_spend_daily")
    .select("product_id, date, amount, fetched_at")
    .in("product_id", Array.from(ownedProductIds));

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

  const orders: ProfitOrderInput[] = (ordersRes.data ?? [])
    .filter((o) => ownedProductIds.has(String(o.product_id)))
    .map((o) => ({
      product_id: String(o.product_id),
      total_price: Number(o.total_price) || 0,
      status: o.status as OrderStatus,
      ordered_at: String(o.ordered_at ?? ""),
      delivery_cost: o.delivery_cost == null ? null : Number(o.delivery_cost),
      quantity: o.quantity == null ? 1 : Number(o.quantity),
      unit_cost_price: o.unit_cost_price == null ? null : Number(o.unit_cost_price),
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
      adSpendDaily,
      summary,
      products,
      campaignsByProduct,
      adSpendFetchedAtByProduct,
      adSpendFreshness: freshness,
      todayKey,
    },
  };
}

/** Array form of the affiliate product metadata `buildProductProfitRows` needs — ships to the client the same way `ProductMetaInput[]` does for owned products. */
export type AffiliateProductMetaInput = {
  productId: string;
  name: string;
  costPrice: number | null;
  calculationStartDate: string | null;
  affiliateCommissionType: "fixed" | "set_price" | null;
  affiliateFixedCommission: number | null;
  affiliateSellPrice: number | null;
  currency: string | null;
  createdAt: string;
};

export type AffiliateAnalyticsData = {
  orders: ProfitOrderInput[];
  products: AffiliateProductMetaInput[];
  adSpendDaily: AdSpendDailyInput[];
};

export type LoadAffiliateAnalyticsResult =
  | { ok: true; data: AffiliateAnalyticsData }
  | { ok: false; error: string };

/**
 * Separate loader for affiliate products. Ships raw orders/product-meta/
 * ad-spend — never MRU totals — so the client can run the exact same
 * `buildProductProfitRows` pipeline `AnalyticsView` uses for owned products
 * (currency grouping happens client-side in `AffiliateAnalyticsSection`),
 * which is what lets the period filter recompute instantly there too. Still
 * never combined with the owned/MRU pipeline above and never summed across
 * different affiliate currencies with each other.
 */
export async function loadAffiliateAnalyticsData(
  cookieClient: SupabaseClient,
  countryId?: string,
): Promise<LoadAffiliateAnalyticsResult> {
  let affiliateProductsQuery = cookieClient
    .from("products")
    .select(
      "id, name_ar, cost_price, profit_calculation_start_date, affiliate_commission_type, affiliate_fixed_commission, affiliate_sell_price, affiliate_currency, created_at",
    )
    .eq("fulfillment_type", "affiliate");
  if (countryId) {
    affiliateProductsQuery = affiliateProductsQuery.eq("country_id", countryId);
  }
  const { data: productRows, error: productsErr } = await affiliateProductsQuery;

  if (productsErr) return { ok: false, error: productsErr.message };
  const productRowsData = productRows ?? [];
  if (productRowsData.length === 0) {
    return { ok: true, data: { orders: [], products: [], adSpendDaily: [] } };
  }

  const productIds = productRowsData.map((p) => String(p.id));

  // Same write-then-read constraint as loadAnalyticsData: ensureFreshAdSpend
  // writes product_ad_spend_daily, so its read below must wait for it, but
  // the orders fetch touches neither table and can run concurrently with it.
  const [ordersRes] = await Promise.all([
    cookieClient
      .from("orders")
      .select(
        "product_id, total_price, status, ordered_at, quantity, affiliate_other_costs, affiliate_costs_finalized, unit_cost_price, affiliate_commission_type_at_order, affiliate_fixed_commission_at_order, affiliate_sell_price_at_order",
      )
      .in("product_id", productIds),
    ensureFreshAdSpend(
      createServiceClient(),
      productRowsData.map((p) => ({ id: String(p.id), createdAt: String(p.created_at ?? "") })),
    ),
  ]);
  if (ordersRes.error) return { ok: false, error: ordersRes.error.message };

  const { data: adSpendDailyRows, error: adSpendErr } = await cookieClient
    .from("product_ad_spend_daily")
    .select("product_id, date, amount")
    .in("product_id", productIds);
  if (adSpendErr) return { ok: false, error: adSpendErr.message };

  const adSpendDaily: AdSpendDailyInput[] = (adSpendDailyRows ?? []).map((r) => ({
    product_id: String(r.product_id),
    date: String(r.date),
    amount: Number(r.amount) || 0,
  }));

  const products: AffiliateProductMetaInput[] = productRowsData.map((p) => ({
    productId: String(p.id),
    name: String(p.name_ar ?? "—"),
    costPrice: p.cost_price == null ? null : Number(p.cost_price),
    calculationStartDate: p.profit_calculation_start_date
      ? String(p.profit_calculation_start_date).slice(0, 10)
      : null,
    affiliateCommissionType: p.affiliate_commission_type,
    affiliateFixedCommission:
      p.affiliate_fixed_commission == null ? null : Number(p.affiliate_fixed_commission),
    affiliateSellPrice: p.affiliate_sell_price == null ? null : Number(p.affiliate_sell_price),
    currency: p.affiliate_currency,
    createdAt: String(p.created_at ?? ""),
  }));

  const orders: ProfitOrderInput[] = (ordersRes.data ?? []).map((o) => ({
    product_id: String(o.product_id),
    total_price: Number(o.total_price) || 0,
    status: o.status as OrderStatus,
    ordered_at: String(o.ordered_at ?? ""),
    quantity: o.quantity == null ? 1 : Number(o.quantity),
    affiliate_other_costs: o.affiliate_other_costs == null ? null : Number(o.affiliate_other_costs),
    affiliate_costs_finalized: Boolean(o.affiliate_costs_finalized),
    unit_cost_price: o.unit_cost_price == null ? null : Number(o.unit_cost_price),
    affiliate_commission_type_at_order: o.affiliate_commission_type_at_order,
    affiliate_fixed_commission_at_order:
      o.affiliate_fixed_commission_at_order == null ? null : Number(o.affiliate_fixed_commission_at_order),
    affiliate_sell_price_at_order:
      o.affiliate_sell_price_at_order == null ? null : Number(o.affiliate_sell_price_at_order),
  }));

  return { ok: true, data: { orders, products, adSpendDaily } };
}
