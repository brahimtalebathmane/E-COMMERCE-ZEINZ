import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderStatus } from "@/types";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureFreshAdSpend } from "@/lib/analytics/ad-spend-sync";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
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
  /** True when either the orders or the ad-spend read hit the pagination cap
   *  and may be incomplete — see `fetchAllRows`. Must be surfaced loudly: a
   *  totals figure built from a truncated read cannot be trusted. */
  truncated: boolean;
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

  const ownedProductIdList = Array.from(ownedProductIds);

  // ensureFreshAdSpend WRITES to product_ad_spend_daily, so the read of that
  // same table below must wait for it to finish (otherwise the read can race
  // ahead and return stale data) — but it doesn't touch `orders` at all, so
  // that fetch is genuinely independent and can run alongside it. Both reads
  // are paginated (fetchAllRows): a plain `.select()` truncates silently past
  // PostgREST's default 1000-row cap, and this store is already over it.
  const [ordersRes, freshness] = await Promise.all([
    fetchAllRows<{
      product_id: string;
      total_price: number;
      status: string;
      ordered_at: string;
      delivery_cost: number | null;
      quantity: number | null;
      unit_cost_price: number | null;
      id: string;
    }>(
      () =>
        cookieClient
          .from("orders")
          .select(
            "id, product_id, total_price, status, ordered_at, delivery_cost, quantity, unit_cost_price",
          )
          .in("product_id", ownedProductIdList) as never,
      "id",
    ),
    ensureFreshAdSpend(
      createServiceClient(),
      productRows.map((p) => ({ id: String(p.id), createdAt: String(p.created_at ?? "") })),
    ),
  ]);

  if (ordersRes.error) return { ok: false, error: ordersRes.error };

  const adSpendDailyRes = await fetchAllRows<{
    product_id: string;
    date: string;
    amount: number;
    fetched_at: string | null;
  }>(
    () =>
      cookieClient
        .from("product_ad_spend_daily")
        .select("product_id, date, amount, fetched_at")
        .in("product_id", ownedProductIdList) as never,
    "date",
  );

  if (adSpendDailyRes.error) return { ok: false, error: adSpendDailyRes.error };

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

  const adSpendDaily = adSpendDailyRes.rows.map((r) => ({
    product_id: String(r.product_id),
    date: String(r.date),
    amount: Number(r.amount) || 0,
  }));

  const adSpendFetchedAtByProduct = new Map<string, string>();
  for (const r of adSpendDailyRes.rows) {
    const productId = String(r.product_id);
    const fetchedAt = String(r.fetched_at ?? "");
    const current = adSpendFetchedAtByProduct.get(productId);
    if (fetchedAt && (!current || fetchedAt > current)) {
      adSpendFetchedAtByProduct.set(productId, fetchedAt);
    }
  }

  const orders: ProfitOrderInput[] = ordersRes.rows.map((o) => ({
    product_id: String(o.product_id),
    total_price: Number(o.total_price) || 0,
    status: o.status as OrderStatus,
    ordered_at: String(o.ordered_at ?? ""),
    delivery_cost: o.delivery_cost == null ? null : Number(o.delivery_cost),
    quantity: o.quantity == null ? 1 : Number(o.quantity),
    unit_cost_price: o.unit_cost_price == null ? null : Number(o.unit_cost_price),
  }));

  const rows = buildProductProfitRows({ orders, products: productMetaMap, adSpendDaily });
  const totals = sumProfitTotals(rows);
  const truncated = ordersRes.truncated || adSpendDailyRes.truncated;

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
      truncated,
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
  /** code -> MRU per unit (from `currency_rates`), for converting MRU ad spend
   *  into each affiliate row's own currency. A code absent here cannot be
   *  converted — the row must show "غير متاح", never an invented rate. Plain
   *  object (not Map) so it survives the server->client prop boundary. */
  mruPerUnitByCurrency: Record<string, number>;
  /** True when the orders or ad-spend read hit the pagination cap (see `fetchAllRows`). */
  truncated: boolean;
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
    return {
      ok: true,
      data: { orders: [], products: [], adSpendDaily: [], mruPerUnitByCurrency: {}, truncated: false },
    };
  }

  const productIds = productRowsData.map((p) => String(p.id));

  // Same write-then-read constraint as loadAnalyticsData: ensureFreshAdSpend
  // writes product_ad_spend_daily, so its read below must wait for it, but
  // the orders fetch touches neither table and can run concurrently with it.
  // Both reads are paginated (fetchAllRows) — see loadAnalyticsData for why.
  const [ordersRes, ratesRes] = await Promise.all([
    fetchAllRows<{
      id: string;
      product_id: string;
      total_price: number;
      status: string;
      ordered_at: string;
      quantity: number | null;
      affiliate_other_costs: number | null;
      affiliate_costs_finalized: boolean | null;
      unit_cost_price: number | null;
      affiliate_commission_type_at_order: string | null;
      affiliate_fixed_commission_at_order: number | null;
      affiliate_sell_price_at_order: number | null;
    }>(
      () =>
        cookieClient
          .from("orders")
          .select(
            "id, product_id, total_price, status, ordered_at, quantity, affiliate_other_costs, affiliate_costs_finalized, unit_cost_price, affiliate_commission_type_at_order, affiliate_fixed_commission_at_order, affiliate_sell_price_at_order",
          )
          .in("product_id", productIds) as never,
      "id",
    ),
    cookieClient.from("currency_rates").select("code, mru_per_unit"),
    ensureFreshAdSpend(
      createServiceClient(),
      productRowsData.map((p) => ({ id: String(p.id), createdAt: String(p.created_at ?? "") })),
    ),
  ]);
  if (ordersRes.error) return { ok: false, error: ordersRes.error };
  if (ratesRes.error) return { ok: false, error: ratesRes.error.message };

  const mruPerUnitByCurrency: Record<string, number> = {};
  for (const r of ratesRes.data ?? []) {
    const code = String(r.code ?? "").trim().toUpperCase();
    const rate = Number(r.mru_per_unit);
    if (code && Number.isFinite(rate) && rate > 0) mruPerUnitByCurrency[code] = rate;
  }

  const adSpendDailyRes = await fetchAllRows<{ product_id: string; date: string; amount: number }>(
    () =>
      cookieClient
        .from("product_ad_spend_daily")
        .select("product_id, date, amount")
        .in("product_id", productIds) as never,
    "date",
  );
  if (adSpendDailyRes.error) return { ok: false, error: adSpendDailyRes.error };

  const adSpendDaily: AdSpendDailyInput[] = adSpendDailyRes.rows.map((r) => ({
    product_id: String(r.product_id),
    date: String(r.date),
    amount: Number(r.amount) || 0,
  }));

  const truncated = ordersRes.truncated || adSpendDailyRes.truncated;

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

  const orders: ProfitOrderInput[] = ordersRes.rows.map((o) => ({
    product_id: String(o.product_id),
    total_price: Number(o.total_price) || 0,
    status: o.status as OrderStatus,
    ordered_at: String(o.ordered_at ?? ""),
    quantity: o.quantity == null ? 1 : Number(o.quantity),
    affiliate_other_costs: o.affiliate_other_costs == null ? null : Number(o.affiliate_other_costs),
    affiliate_costs_finalized: Boolean(o.affiliate_costs_finalized),
    unit_cost_price: o.unit_cost_price == null ? null : Number(o.unit_cost_price),
    affiliate_commission_type_at_order:
      o.affiliate_commission_type_at_order as ProfitOrderInput["affiliate_commission_type_at_order"],
    affiliate_fixed_commission_at_order:
      o.affiliate_fixed_commission_at_order == null ? null : Number(o.affiliate_fixed_commission_at_order),
    affiliate_sell_price_at_order:
      o.affiliate_sell_price_at_order == null ? null : Number(o.affiliate_sell_price_at_order),
  }));

  return { ok: true, data: { orders, products, adSpendDaily, mruPerUnitByCurrency, truncated } };
}
