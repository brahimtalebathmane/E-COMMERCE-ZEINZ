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
      .select("product_id, total_price, status, created_at, delivery_cost, quantity"),
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

export type AffiliateCurrencyGroup = {
  currency: string;
  rows: ProductProfitRow[];
  totals: ProfitTotals;
};

export type AffiliateAnalyticsData = {
  groups: AffiliateCurrencyGroup[];
};

export type LoadAffiliateAnalyticsResult =
  | { ok: true; data: AffiliateAnalyticsData }
  | { ok: false; error: string };

/**
 * Separate loader for affiliate products' profit, grouped by each product's
 * own currency (KWD, etc.) — never combined with the owned/MRU pipeline
 * above and never summed across different currencies with each other.
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
  const products = productRows ?? [];
  if (products.length === 0) return { ok: true, data: { groups: [] } };

  const productIds = products.map((p) => String(p.id));

  // Same write-then-read constraint as loadAnalyticsData: ensureFreshAdSpend
  // writes product_ad_spend_daily, so its read below must wait for it, but
  // the orders fetch touches neither table and can run concurrently with it.
  const [ordersRes] = await Promise.all([
    cookieClient
      .from("orders")
      .select(
        "product_id, total_price, status, created_at, quantity, affiliate_other_costs, affiliate_costs_finalized",
      )
      .in("product_id", productIds),
    ensureFreshAdSpend(
      createServiceClient(),
      products.map((p) => ({ id: String(p.id), createdAt: String(p.created_at ?? "") })),
    ),
  ]);
  if (ordersRes.error) return { ok: false, error: ordersRes.error.message };

  const { data: adSpendDailyRows } = await cookieClient
    .from("product_ad_spend_daily")
    .select("product_id, amount")
    .in("product_id", productIds);

  const adSpendByProduct = new Map<string, number>();
  for (const r of adSpendDailyRows ?? []) {
    const pid = String(r.product_id);
    adSpendByProduct.set(pid, (adSpendByProduct.get(pid) ?? 0) + (Number(r.amount) || 0));
  }

  const productMetaMap = new Map(
    products.map((p) => [
      String(p.id),
      {
        name: String(p.name_ar ?? "—"),
        costPrice: p.cost_price == null ? null : Number(p.cost_price),
        calculationStartDate: p.profit_calculation_start_date
          ? String(p.profit_calculation_start_date).slice(0, 10)
          : null,
        fulfillmentType: "affiliate" as const,
        affiliateCommissionType: p.affiliate_commission_type,
        affiliateFixedCommission:
          p.affiliate_fixed_commission == null ? null : Number(p.affiliate_fixed_commission),
        affiliateSellPrice: p.affiliate_sell_price == null ? null : Number(p.affiliate_sell_price),
        currency: p.affiliate_currency,
      },
    ]),
  );

  const orders: ProfitOrderInput[] = (ordersRes.data ?? []).map((o) => ({
    product_id: String(o.product_id),
    total_price: Number(o.total_price) || 0,
    status: o.status as OrderStatus,
    created_at: String(o.created_at ?? ""),
    quantity: o.quantity == null ? 1 : Number(o.quantity),
    affiliate_other_costs: o.affiliate_other_costs == null ? null : Number(o.affiliate_other_costs),
    affiliate_costs_finalized: Boolean(o.affiliate_costs_finalized),
  }));

  const rows = buildProductProfitRows({ orders, products: productMetaMap, adSpendByProduct });

  const byCurrency = new Map<string, ProductProfitRow[]>();
  for (const row of rows) {
    const code = row.currency || "—";
    const list = byCurrency.get(code) ?? [];
    list.push(row);
    byCurrency.set(code, list);
  }

  const groups: AffiliateCurrencyGroup[] = Array.from(byCurrency.entries())
    .map(([currency, groupRows]) => ({
      currency,
      rows: groupRows,
      totals: sumProfitTotals(groupRows),
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  return { ok: true, data: { groups } };
}
