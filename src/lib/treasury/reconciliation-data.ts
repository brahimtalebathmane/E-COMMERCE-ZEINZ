import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderStatus } from "@/types";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { dayKey, shiftDateKey } from "@/lib/analytics/daily-profit";
import {
  buildProductProfitRows,
  isOrderOnOrAfterStartDate,
  sumProfitTotals,
  type ProductMeta,
  type ProfitOrderInput,
} from "@/lib/analytics/profit";
import { getTreasuryGoLive, loadAgentHoldings, loadParties, loadUnsettledOrders } from "@/lib/treasury/data";
import {
  bucketCash,
  buildBridge,
  inRange,
  splitRevenue,
  summarizeOpex,
  unlinkedSales,
  type Bridge,
  type CashBuckets,
  type DateRange,
  type OpexData,
  type OpexSummary,
  type RecCategory,
  type RecTxn,
  type RevenueSplit,
} from "@/lib/treasury/reconciliation";

export type { OpexData };

async function loadRecCategories(service: SupabaseClient, countryId: string): Promise<RecCategory[]> {
  const { data, error } = await service
    .from("treasury_categories")
    .select("id, parent_id, name_ar, system_key, counted_in_profit_by")
    .eq("country_id", countryId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({
    id: String(c.id),
    parentId: (c.parent_id as string | null) ?? null,
    name: String(c.name_ar),
    systemKey: (c.system_key as string | null) ?? null,
    countedInProfitBy: c.counted_in_profit_by as RecCategory["countedInProfitBy"],
  }));
}

async function loadRecTxns(
  service: SupabaseClient,
  countryId: string,
  opts: { from: string; to?: string; categoryIds?: string[] },
): Promise<RecTxn[]> {
  if (opts.categoryIds && opts.categoryIds.length === 0) return [];
  const { rows, error, truncated } = await fetchAllRows<{
    id: string;
    amount: number;
    category_id: string;
    occurred_on: string;
    order_id: string | null;
  }>(() => {
    let q = service
      .from("treasury_transactions")
      .select("id, amount, category_id, occurred_on, order_id")
      .eq("country_id", countryId)
      .gte("occurred_on", opts.from);
    if (opts.to) q = q.lte("occurred_on", opts.to);
    if (opts.categoryIds) q = q.in("category_id", opts.categoryIds);
    return q as never;
  }, "id");
  if (error) throw new Error(error);
  // A truncated money read must never be shown as a complete total.
  if (truncated) throw new Error("treasury read truncated");
  return rows.map((t) => ({
    amount: Number(t.amount) || 0,
    categoryId: String(t.category_id),
    occurredOn: String(t.occurred_on),
    orderId: t.order_id,
  }));
}

/**
 * Operating expenses for the profits page and home. Null when the market has
 * no local operations or the treasury is not live yet (nothing to subtract).
 * The caller has already checked view_analytics; reads use the service client
 * because analytics viewers do not need treasury permissions to see the total.
 */
export async function loadOpexForProfit(service: SupabaseClient, countryId: string): Promise<OpexData | null> {
  const goLive = await getTreasuryGoLive(service, countryId);
  if (!goLive) return null;
  const categories = await loadRecCategories(service, countryId);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const opexIds = categories
    .filter((c) => (c.parentId ? byId.get(c.parentId)?.countedInProfitBy : c.countedInProfitBy) === "opex")
    .map((c) => c.id);
  const txns = await loadRecTxns(service, countryId, { from: goLive.goLiveOn, categoryIds: opexIds });
  return { goLiveOn: goLive.goLiveOn, todayKey: dayKey(new Date()), categories, txns };
}

export type FlaggedOrder = { id: string; orderedAt: string; totalPrice: number; productName: string };

export type ReconciliationReport = {
  range: DateRange;
  goLiveOn: string;
  profit: { grossRevenue: number; cogs: number; deliveryCost: number; adSpend: number; netProfit: number; ordersCount: number };
  opex: OpexSummary;
  cash: CashBuckets;
  bridge: Bridge;
  revenue: RevenueSplit;
  unlinkedSales: { count: number; amount: number };
  agents: { partyId: string | null; name: string; unsettledOrders: number; cashHeld: number; returnsAwaitingFee: number }[];
  flags: {
    missingDeliveryCost: FlaggedOrder[];
    missingCostProducts: string[];
    productsWithoutCampaign: string[];
    outsideTreasury: FlaggedOrder[];
  };
};

/** Splits ids into URL-safe chunks for `.in()` filters. */
function chunks<T>(list: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Everything the reconciliation page shows for one range (already clipped to
 * the treasury go-live, see clipToTreasury). Owned products of the
 * local-operations market only; the caller has checked the country and the
 * treasury + analytics permissions.
 */
export async function loadReconciliation(
  service: SupabaseClient,
  countryId: string,
  goLiveOn: string,
  range: DateRange,
): Promise<ReconciliationReport> {
  const productsRes = await service
    .from("products")
    .select("id, name_ar, cost_price, profit_calculation_start_date")
    .eq("country_id", countryId)
    .eq("fulfillment_type", "owned");
  if (productsRes.error) throw new Error(productsRes.error.message);
  const productRows = productsRes.data ?? [];
  const productIds = productRows.map((p) => String(p.id));
  const products = new Map<string, ProductMeta>(
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

  // Africa/Nouakchott is UTC+0 all year, so day keys map to UTC midnights;
  // the read is widened by a day and filtered by dayKey() like the profits page.
  const fromIso = `${shiftDateKey(range.startKey, -1)}T00:00:00Z`;
  const toIso = `${shiftDateKey(range.endKey, 2)}T00:00:00Z`;

  const [ordersRes, adSpendRes, campaignsRes, categories, txns, unsettled, holdings, parties] = await Promise.all([
    productIds.length === 0
      ? Promise.resolve({ rows: [], error: null, truncated: false })
      : fetchAllRows<{
          id: string;
          product_id: string;
          total_price: number;
          status: string;
          ordered_at: string;
          delivery_cost: number | null;
          quantity: number | null;
          unit_cost_price: number | null;
        }>(
          () =>
            service
              .from("orders")
              .select("id, product_id, total_price, status, ordered_at, delivery_cost, quantity, unit_cost_price")
              .in("product_id", productIds)
              .is("deleted_at", null)
              .gte("ordered_at", fromIso)
              .lt("ordered_at", toIso) as never,
          "id",
        ),
    productIds.length === 0
      ? Promise.resolve({ rows: [], error: null, truncated: false })
      : fetchAllRows<{ product_id: string; date: string; amount: number }>(
          () =>
            service
              .from("product_ad_spend_daily")
              .select("product_id, date, amount")
              .in("product_id", productIds)
              .gte("date", range.startKey)
              .lte("date", range.endKey) as never,
          ["date", "product_id"],
        ),
    service.from("product_ad_campaigns").select("product_id"),
    loadRecCategories(service, countryId),
    loadRecTxns(service, countryId, { from: range.startKey, to: range.endKey }),
    loadUnsettledOrders(service, countryId),
    loadAgentHoldings(service, countryId),
    loadParties(service, countryId),
  ]);
  if (ordersRes.error) throw new Error(ordersRes.error);
  if (adSpendRes.error) throw new Error(adSpendRes.error);
  if (ordersRes.truncated || adSpendRes.truncated) throw new Error("orders or ad spend read truncated");
  if (campaignsRes.error) throw new Error(campaignsRes.error.message);

  const orders: (ProfitOrderInput & { id: string })[] = ordersRes.rows
    .filter((o) => inRange(dayKey(String(o.ordered_at)), range))
    .map((o) => ({
      id: String(o.id),
      product_id: String(o.product_id),
      total_price: Number(o.total_price) || 0,
      status: o.status as OrderStatus,
      ordered_at: String(o.ordered_at),
      delivery_cost: o.delivery_cost == null ? null : Number(o.delivery_cost),
      quantity: o.quantity == null ? 1 : Number(o.quantity),
      unit_cost_price: o.unit_cost_price == null ? null : Number(o.unit_cost_price),
    }));
  const adSpendDaily = adSpendRes.rows.map((r) => ({
    product_id: String(r.product_id),
    date: String(r.date),
    amount: Number(r.amount) || 0,
  }));
  const totals = sumProfitTotals(buildProductProfitRows({ orders, products, adSpendDaily }));
  const profit = {
    grossRevenue: totals.grossRevenue,
    cogs: totals.cogs,
    deliveryCost: totals.deliveryCost,
    adSpend: totals.adSpend,
    netProfit: totals.netProfit,
    ordersCount: totals.ordersCount,
  };

  // The orders the profits page counts as revenue (same rule as buildProductProfitRows).
  const revenueOrders = orders.filter(
    (o) =>
      o.status === "shipped" &&
      isOrderOnOrAfterStartDate(o.ordered_at, products.get(o.product_id)?.calculationStartDate),
  );

  const settledIds = new Set<string>();
  for (const ids of chunks(revenueOrders.map((o) => o.id))) {
    const { data, error } = await service
      .from("treasury_settlement_orders")
      .select("order_id")
      .eq("voided", false)
      .eq("kind", "sale")
      .in("order_id", ids);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) settledIds.add(String(r.order_id));
  }
  const unsettledIds = new Set(unsettled.filter((u) => u.kind === "sale").map((u) => u.orderId));

  const opex = summarizeOpex(txns, categories, range);
  const cash = bucketCash(txns, categories, range);
  const bridge = buildBridge(profit, opex, cash);
  const revenue = splitRevenue(
    revenueOrders.map((o) => ({ id: o.id, totalPrice: o.total_price })),
    settledIds,
    unsettledIds,
  );

  const nameOf = (productId: string) => products.get(productId)?.name ?? "—";
  const flagged = (o: (typeof revenueOrders)[number]): FlaggedOrder => ({
    id: o.id,
    orderedAt: o.ordered_at,
    totalPrice: o.total_price,
    productName: nameOf(o.product_id),
  });
  const linked = new Set((campaignsRes.data ?? []).map((c) => String(c.product_id)));
  const soldProducts = new Set(revenueOrders.map((o) => o.product_id));
  const missingCostProducts = new Set<string>();
  for (const o of revenueOrders) {
    if (o.unit_cost_price == null && products.get(o.product_id)?.costPrice == null) {
      missingCostProducts.add(nameOf(o.product_id));
    }
  }
  const partyName = new Map(parties.map((p) => [p.id, p.name]));

  return {
    range,
    goLiveOn,
    profit,
    opex,
    cash,
    bridge,
    revenue,
    unlinkedSales: unlinkedSales(txns, categories, range),
    agents: holdings
      .map((h) => ({ ...h, name: h.partyId ? partyName.get(h.partyId) ?? "—" : "—" }))
      .sort((a, b) => b.cashHeld - a.cashHeld),
    flags: {
      missingDeliveryCost: revenueOrders.filter((o) => o.delivery_cost == null).map(flagged),
      missingCostProducts: Array.from(missingCostProducts).sort(),
      productsWithoutCampaign: Array.from(soldProducts)
        .filter((id) => !linked.has(id))
        .map(nameOf)
        .sort(),
      outsideTreasury: revenueOrders.filter((o) => !settledIds.has(o.id) && !unsettledIds.has(o.id)).map(flagged),
    },
  };
}
