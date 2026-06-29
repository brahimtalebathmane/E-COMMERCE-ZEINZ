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
  products (
    name_ar,
    slug,
    price,
    discount_price,
    media_type,
    media_url
  )
` as const;

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
  };
}

/** Sort rows newest-first by operational created_at. */
export function sortOrdersNewestFirst(rows: AdminOrderRow[]): AdminOrderRow[] {
  return [...rows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}
