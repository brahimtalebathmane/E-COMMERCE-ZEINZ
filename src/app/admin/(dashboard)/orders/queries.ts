import type { AdminOrderRow } from "./types";

/** Shared Supabase select for admin order rows (includes product join). */
export const ADMIN_ORDER_SELECT = `
  id,
  product_id,
  customer_name,
  phone,
  total_price,
  currency,
  status,
  completion_token,
  created_at,
  delivery_cost,
  note,
  quantity,
  source,
  manual_sale_group_id,
  meta_lead_sent,
  meta_purchase_sent,
  meta_cancel_sent,
  affiliate_address,
  affiliate_country,
  affiliate_city,
  affiliate_other_costs,
  affiliate_costs_finalized,
  products (
    name_ar,
    slug,
    price,
    discount_price,
    media_type,
    media_url,
    fulfillment_type,
    affiliate_commission_type,
    affiliate_sku,
    affiliate_sheet_url,
    country_id
  )
` as const;

/**
 * Same shape as ADMIN_ORDER_SELECT but with an inner join on products so
 * `.eq("products.country_id", id)` can filter the order list by the admin's
 * currently-selected country (PostgREST requires !inner to filter on an
 * embedded resource's columns).
 */
export const ADMIN_ORDER_SELECT_SCOPED = ADMIN_ORDER_SELECT.replace(
  "products (",
  "products!inner (",
) as string;

export type RealtimeOrderPayload = {
  id: string;
  product_id: string;
  customer_name: string | null;
  phone: string | null;
  total_price: number;
  currency: string;
  status: AdminOrderRow["status"];
  completion_token: string;
  created_at: string;
  delivery_cost?: number | null;
  note?: string | null;
  quantity?: number;
  deleted_at?: string | null;
};

/** Merge scalar fields from a Realtime payload into an existing admin row. */
export function mergeOrderPayload(
  existing: AdminOrderRow,
  payload: RealtimeOrderPayload,
): AdminOrderRow {
  return {
    ...existing,
    product_id: payload.product_id,
    customer_name: payload.customer_name,
    phone: payload.phone,
    total_price: payload.total_price,
    currency: payload.currency,
    status: payload.status,
    completion_token: payload.completion_token,
    created_at: payload.created_at,
    delivery_cost: payload.delivery_cost ?? existing.delivery_cost,
    note: payload.note ?? existing.note,
    quantity: payload.quantity ?? existing.quantity,
  };
}

/** Sort rows newest-first by operational created_at. */
export function sortOrdersNewestFirst(rows: AdminOrderRow[]): AdminOrderRow[] {
  return [...rows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}
