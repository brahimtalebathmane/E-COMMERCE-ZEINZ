import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

/**
 * Treasury reads (Phase C). Callers pass the service-role client after
 * checking view_treasury / manage_treasury and the local-operations scope.
 */

export type AccountType = "cash" | "bank" | "mobile_wallet" | "person_custody";
export type CategoryDirection = "income" | "expense" | "adjustment";
export type CountedInProfitBy = "orders" | "opex" | "none";
export type PartyType = "delivery_agent" | "supplier" | "employee" | "other";
export type TransactionKind = "normal" | "opening" | "transfer" | "reversal" | "adjustment" | "settlement";

export type TreasuryAccount = {
  id: string;
  name: string;
  type: AccountType;
  isActive: boolean;
  balance: number;
  transactions: number;
};

export type TreasuryCategory = {
  id: string;
  parentId: string | null;
  name: string;
  direction: CategoryDirection;
  countedInProfitBy: CountedInProfitBy;
  systemKey: string | null;
  isActive: boolean;
};

export type TreasuryParty = {
  id: string;
  name: string;
  type: PartyType;
  phone: string | null;
  isDefaultAgent: boolean;
  isActive: boolean;
};

export type AgentHolding = { partyId: string | null; unsettledOrders: number; cashHeld: number; returnsAwaitingFee: number };

export type UnsettledOrder = {
  orderId: string;
  kind: "sale" | "return_fee";
  deliveryAgentId: string | null;
  totalPrice: number;
  deliveryCost: number | null;
  quantity: number;
  customerName: string | null;
  phone: string | null;
  orderedAt: string;
  shippedAt: string | null;
  returnedAt: string | null;
  productName: string;
  carriedOver: boolean;
};

export type TreasuryTransaction = {
  id: string;
  accountId: string;
  accountName: string;
  amount: number;
  categoryId: string;
  categoryName: string;
  partyId: string | null;
  partyName: string | null;
  occurredOn: string;
  note: string | null;
  receiptPath: string | null;
  receiptUrl: string | null;
  kind: TransactionKind;
  orderId: string | null;
  orderRole: "sale" | "delivery_fee" | null;
  settlementId: string | null;
  transferGroupId: string | null;
  reversesId: string | null;
  isReversed: boolean;
  stockPurchaseId: string | null;
  createdAt: string;
};

export type TransactionFilters = {
  from?: string | null;
  to?: string | null;
  accountId?: string | null;
  categoryId?: string | null;
  partyId?: string | null;
};

export type SettlementRow = {
  id: string;
  partyId: string;
  accountName: string;
  settledOn: string;
  collected: number;
  fees: number;
  agentKeptFees: boolean;
  expectedNet: number;
  received: number;
  difference: number;
  reason: string | null;
  orders: number;
  voidedAt: string | null;
  voidedReason: string | null;
};

const RECEIPT_BUCKET = "user-assets";
const RECEIPT_URL_TTL_SECONDS = 60 * 60;

export async function getTreasuryGoLive(
  service: SupabaseClient,
  countryId: string,
): Promise<{ goLiveOn: string; goLiveAt: string } | null> {
  const { data, error } = await service
    .from("treasury_settings")
    .select("go_live_on, go_live_at")
    .eq("country_id", countryId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { goLiveOn: String(data.go_live_on), goLiveAt: String(data.go_live_at) } : null;
}

export async function loadAccounts(service: SupabaseClient, countryId: string): Promise<TreasuryAccount[]> {
  const { data, error } = await service
    .from("treasury_account_balances")
    .select("account_id, name, type, is_active, balance, transactions")
    .eq("country_id", countryId)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((a) => ({
    id: String(a.account_id),
    name: String(a.name),
    type: a.type as AccountType,
    isActive: Boolean(a.is_active),
    balance: Number(a.balance) || 0,
    transactions: Number(a.transactions) || 0,
  }));
}

export async function loadCategories(service: SupabaseClient, countryId: string): Promise<TreasuryCategory[]> {
  const { data, error } = await service
    .from("treasury_categories")
    .select("id, parent_id, name_ar, direction, counted_in_profit_by, system_key, is_active")
    .eq("country_id", countryId)
    .order("name_ar");
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({
    id: String(c.id),
    parentId: (c.parent_id as string | null) ?? null,
    name: String(c.name_ar),
    direction: c.direction as CategoryDirection,
    countedInProfitBy: c.counted_in_profit_by as CountedInProfitBy,
    systemKey: (c.system_key as string | null) ?? null,
    isActive: Boolean(c.is_active),
  }));
}

export async function loadParties(service: SupabaseClient, countryId: string): Promise<TreasuryParty[]> {
  const { data, error } = await service
    .from("treasury_parties")
    .select("id, name, type, phone, is_default_delivery_agent, is_active")
    .eq("country_id", countryId)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({
    id: String(p.id),
    name: String(p.name),
    type: p.type as PartyType,
    phone: (p.phone as string | null) ?? null,
    isDefaultAgent: Boolean(p.is_default_delivery_agent),
    isActive: Boolean(p.is_active),
  }));
}

export async function loadAgentHoldings(service: SupabaseClient, countryId: string): Promise<AgentHolding[]> {
  const { data, error } = await service
    .from("treasury_agent_holdings")
    .select("party_id, unsettled_orders, cash_held, returns_awaiting_fee")
    .eq("country_id", countryId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((h) => ({
    partyId: (h.party_id as string | null) ?? null,
    unsettledOrders: Number(h.unsettled_orders) || 0,
    cashHeld: Number(h.cash_held) || 0,
    returnsAwaitingFee: Number(h.returns_awaiting_fee) || 0,
  }));
}

export async function loadUnsettledOrders(service: SupabaseClient, countryId: string): Promise<UnsettledOrder[]> {
  const { rows, error } = await fetchAllRows<{
    order_id: string;
    kind: "sale" | "return_fee";
    delivery_agent_id: string | null;
    total_price: number;
    delivery_cost: number | null;
    quantity: number;
    customer_name: string | null;
    phone: string | null;
    ordered_at: string;
    shipped_at: string | null;
    returned_at: string | null;
    product_name: string | null;
    carried_over: boolean;
  }>(
    () =>
      service
        .from("treasury_unsettled_orders")
        .select("order_id, kind, delivery_agent_id, total_price, delivery_cost, quantity, customer_name, phone, ordered_at, shipped_at, returned_at, product_name, carried_over")
        .eq("country_id", countryId) as never,
    "order_id",
  );
  if (error) throw new Error(error);
  return rows
    .map((o) => ({
      orderId: String(o.order_id),
      kind: o.kind,
      deliveryAgentId: o.delivery_agent_id,
      totalPrice: Number(o.total_price) || 0,
      deliveryCost: o.delivery_cost == null ? null : Number(o.delivery_cost),
      quantity: Number(o.quantity) || 1,
      customerName: o.customer_name,
      phone: o.phone,
      orderedAt: String(o.ordered_at),
      shippedAt: o.shipped_at,
      returnedAt: o.returned_at,
      productName: String(o.product_name ?? "—"),
      carriedOver: Boolean(o.carried_over),
    }))
    .sort((a, b) => (a.shippedAt ?? a.orderedAt).localeCompare(b.shippedAt ?? b.orderedAt));
}

/**
 * Shipped owned orders of the last `days` days before the treasury exists —
 * the go-live screen lets the owner tick the ones the agent still owes.
 */
export async function loadRecentlyShippedForGoLive(
  service: SupabaseClient,
  countryId: string,
  days = 60,
): Promise<UnsettledOrder[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { rows, error } = await fetchAllRows<{
    id: string;
    total_price: number;
    delivery_cost: number | null;
    quantity: number;
    customer_name: string | null;
    phone: string | null;
    ordered_at: string;
    shipped_at: string | null;
    products: { name_ar: string | null; fulfillment_type: string } | { name_ar: string | null; fulfillment_type: string }[] | null;
  }>(
    () =>
      service
        .from("orders")
        .select("id, total_price, delivery_cost, quantity, customer_name, phone, ordered_at, shipped_at, products!inner(name_ar, fulfillment_type)")
        .eq("country_id", countryId)
        .eq("status", "shipped")
        .is("deleted_at", null)
        .eq("products.fulfillment_type", "owned")
        .gte("ordered_at", since) as never,
    "id",
  );
  if (error) throw new Error(error);
  return rows
    .map((o) => {
      const product = Array.isArray(o.products) ? o.products[0] : o.products;
      return {
        orderId: String(o.id),
        kind: "sale" as const,
        deliveryAgentId: null,
        totalPrice: Number(o.total_price) || 0,
        deliveryCost: o.delivery_cost == null ? null : Number(o.delivery_cost),
        quantity: Number(o.quantity) || 1,
        customerName: o.customer_name,
        phone: o.phone,
        orderedAt: String(o.ordered_at),
        shippedAt: o.shipped_at,
        returnedAt: null,
        productName: String(product?.name_ar ?? "—"),
        carriedOver: false,
      };
    })
    .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt));
}

export async function loadTransactions(
  service: SupabaseClient,
  countryId: string,
  filters: TransactionFilters = {},
  // Kept at 200: the reversal lookup below passes these ids in the URL.
  limit = 200,
): Promise<{ rows: TreasuryTransaction[]; truncated: boolean }> {
  let query = service
    .from("treasury_transactions")
    .select(
      "id, account_id, amount, category_id, party_id, occurred_on, note, receipt_path, kind, order_id, order_role, settlement_id, transfer_group_id, reverses_id, stock_purchase_id, created_at, treasury_accounts(name), treasury_categories(name_ar), treasury_parties(name)",
    )
    .eq("country_id", countryId);
  if (filters.from) query = query.gte("occurred_on", filters.from);
  if (filters.to) query = query.lte("occurred_on", filters.to);
  if (filters.accountId) query = query.eq("account_id", filters.accountId);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.partyId) query = query.eq("party_id", filters.partyId);
  const { data, error } = await query
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (error) throw new Error(error.message);
  const list = data ?? [];
  const truncated = list.length > limit;
  const rows = list.slice(0, limit);

  const ids = rows.map((t) => String(t.id));
  const reversed = new Set<string>();
  if (ids.length > 0) {
    const { data: revs } = await service.from("treasury_transactions").select("reverses_id").in("reverses_id", ids);
    for (const r of revs ?? []) reversed.add(String(r.reverses_id));
  }

  const receiptPaths = rows.map((t) => t.receipt_path as string | null).filter((p): p is string => Boolean(p));
  const receiptUrls = new Map<string, string>();
  if (receiptPaths.length > 0) {
    const { data: signed } = await service.storage.from(RECEIPT_BUCKET).createSignedUrls(receiptPaths, RECEIPT_URL_TTL_SECONDS);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) receiptUrls.set(s.path, s.signedUrl);
    }
  }

  const name = (rel: unknown, key: string): string | null => {
    const v = Array.isArray(rel) ? rel[0] : rel;
    return v && typeof v === "object" && key in v ? String((v as Record<string, unknown>)[key] ?? "") : null;
  };

  return {
    truncated,
    rows: rows.map((t) => ({
      id: String(t.id),
      accountId: String(t.account_id),
      accountName: name(t.treasury_accounts, "name") ?? "—",
      amount: Number(t.amount) || 0,
      categoryId: String(t.category_id),
      categoryName: name(t.treasury_categories, "name_ar") ?? "—",
      partyId: (t.party_id as string | null) ?? null,
      partyName: name(t.treasury_parties, "name"),
      occurredOn: String(t.occurred_on),
      note: (t.note as string | null) ?? null,
      receiptPath: (t.receipt_path as string | null) ?? null,
      receiptUrl: t.receipt_path ? receiptUrls.get(String(t.receipt_path)) ?? null : null,
      kind: t.kind as TransactionKind,
      orderId: (t.order_id as string | null) ?? null,
      orderRole: (t.order_role as "sale" | "delivery_fee" | null) ?? null,
      settlementId: (t.settlement_id as string | null) ?? null,
      transferGroupId: (t.transfer_group_id as string | null) ?? null,
      reversesId: (t.reverses_id as string | null) ?? null,
      isReversed: reversed.has(String(t.id)),
      stockPurchaseId: (t.stock_purchase_id as string | null) ?? null,
      createdAt: String(t.created_at),
    })),
  };
}

export async function loadSettlements(
  service: SupabaseClient,
  countryId: string,
  partyId?: string,
  limit = 50,
): Promise<SettlementRow[]> {
  let query = service
    .from("treasury_settlements")
    .select("id, party_id, settled_on, collected, fees, agent_kept_fees, expected_net, received, difference, reason, voided_at, voided_reason, created_at, treasury_accounts(name), treasury_settlement_orders(order_id)")
    .eq("country_id", countryId);
  if (partyId) query = query.eq("party_id", partyId);
  const { data, error } = await query.order("settled_on", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => {
    const account = Array.isArray(s.treasury_accounts) ? s.treasury_accounts[0] : s.treasury_accounts;
    const orders = Array.isArray(s.treasury_settlement_orders) ? s.treasury_settlement_orders.length : 0;
    return {
      id: String(s.id),
      partyId: String(s.party_id),
      accountName: String((account as { name?: string } | null)?.name ?? "—"),
      settledOn: String(s.settled_on),
      collected: Number(s.collected) || 0,
      fees: Number(s.fees) || 0,
      agentKeptFees: Boolean(s.agent_kept_fees),
      expectedNet: Number(s.expected_net) || 0,
      received: Number(s.received) || 0,
      difference: Number(s.difference) || 0,
      reason: (s.reason as string | null) ?? null,
      orders,
      voidedAt: (s.voided_at as string | null) ?? null,
      voidedReason: (s.voided_reason as string | null) ?? null,
    };
  });
}
