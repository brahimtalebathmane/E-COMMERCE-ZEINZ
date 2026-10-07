import type { OrderStatus } from "@/types";

/**
 * Filters of the admin orders list. They live in the URL (so a refresh keeps
 * them) and are applied on the server to the query that reads every order of
 * the selected country; the same definition re-checks rows that arrive later
 * through Realtime. Pure — shared by the server page and the client view.
 *
 * URL: ?status=pending,confirmed&from=YYYY-MM-DD&to=YYYY-MM-DD&older=30&product=<uuid>&source=manual&q=text
 */

export const FILTER_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "shipped",
  "cancelled",
  "internal_return",
  "requires_human_intervention",
];

export const OLDER_THAN_PRESETS = [7, 30, 60] as const;
export type OlderThanDays = (typeof OLDER_THAN_PRESETS)[number];

export type OrderSourceFilter = "manual" | "storefront";

export type OrderListFilters = {
  statuses: OrderStatus[];
  /** Inclusive business-date bounds (ordered_at), YYYY-MM-DD in Africa/Nouakchott (= UTC). */
  from: string | null;
  to: string | null;
  /** "Older than N days": ordered_at before now − N days. */
  olderThanDays: OlderThanDays | null;
  productId: string | null;
  source: OrderSourceFilter | null;
  /** Free-text search (name / phone), applied on top of the filters. */
  q: string;
};

export const EMPTY_ORDER_FILTERS: OrderListFilters = {
  statuses: [],
  from: null,
  to: null,
  olderThanDays: null,
  productId: null,
  source: null,
  q: "",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;

type RawParams = Record<string, string | string[] | undefined> | URLSearchParams;

function get(params: RawParams, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

function validDate(value: string | undefined): string | null {
  if (!value || !DATE_RE.test(value)) return null;
  return Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) ? null : value;
}

/** Reads filters from the URL; anything invalid is ignored rather than failing the page. */
export function parseOrderListFilters(params: RawParams): OrderListFilters {
  const statuses = (get(params, "status") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is OrderStatus => (FILTER_STATUSES as string[]).includes(s));
  const older = Number(get(params, "older"));
  const product = get(params, "product");
  const source = get(params, "source");
  let from = validDate(get(params, "from"));
  let to = validDate(get(params, "to"));
  if (from && to && from > to) [from, to] = [to, from];
  return {
    statuses: FILTER_STATUSES.filter((s) => statuses.includes(s)),
    from,
    to,
    olderThanDays: (OLDER_THAN_PRESETS as readonly number[]).includes(older) ? (older as OlderThanDays) : null,
    productId: product && UUID_RE.test(product) ? product : null,
    source: source === "manual" || source === "storefront" ? source : null,
    q: (get(params, "q") ?? "").slice(0, 100),
  };
}

export function serializeOrderListFilters(f: OrderListFilters): string {
  const p = new URLSearchParams();
  if (f.statuses.length > 0) p.set("status", f.statuses.join(","));
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.olderThanDays) p.set("older", String(f.olderThanDays));
  if (f.productId) p.set("product", f.productId);
  if (f.source) p.set("source", f.source);
  if (f.q.trim()) p.set("q", f.q.trim());
  return p.toString();
}

/** True when a filter narrows the server query (the text search does not). */
export function hasServerFilters(f: OrderListFilters): boolean {
  return Boolean(f.statuses.length || f.from || f.to || f.olderThanDays || f.productId || f.source);
}

/** Half-open ISO bounds on ordered_at: gte ≤ ordered_at < lt. */
export type OrderDateBounds = { gte: string | null; lt: string | null };

function nextDayIso(dayKey: string): string {
  return new Date(new Date(`${dayKey}T00:00:00Z`).getTime() + DAY_MS).toISOString();
}

/**
 * Turns from/to/older-than into ordered_at bounds. Computed once on the server
 * (`now` = request time) and handed to the client, so "older than 30 days"
 * means the same instant for the query and for rows arriving later.
 */
export function orderDateBounds(f: OrderListFilters, now: Date): OrderDateBounds {
  const gte = f.from ? new Date(`${f.from}T00:00:00Z`).toISOString() : null;
  const candidates: string[] = [];
  if (f.to) candidates.push(nextDayIso(f.to));
  if (f.olderThanDays) candidates.push(new Date(now.getTime() - f.olderThanDays * DAY_MS).toISOString());
  const lt = candidates.length > 0 ? candidates.sort()[0] : null;
  return { gte, lt };
}

export type FilterableOrder = { status: OrderStatus; ordered_at: string; product_id: string; source: string };

/** Same rules as the server query, for rows that change or arrive through Realtime. */
export function matchesOrderListFilters(row: FilterableOrder, f: OrderListFilters, bounds: OrderDateBounds): boolean {
  if (f.statuses.length > 0 && !f.statuses.includes(row.status)) return false;
  if (f.productId && row.product_id !== f.productId) return false;
  if (f.source && row.source !== f.source) return false;
  if (bounds.gte || bounds.lt) {
    const t = new Date(row.ordered_at).getTime();
    if (Number.isNaN(t)) return false;
    if (bounds.gte && t < new Date(bounds.gte).getTime()) return false;
    if (bounds.lt && t >= new Date(bounds.lt).getTime()) return false;
  }
  return true;
}

/** Count and total amount of a set of orders, one total per currency (never summed across currencies). */
export function summarizeOrders(rows: { total_price: number; currency: string }[]): {
  count: number;
  totals: { currency: string; amount: number }[];
} {
  const byCurrency = new Map<string, number>();
  for (const r of rows) {
    const cur = (r.currency || "").toUpperCase();
    byCurrency.set(cur, (byCurrency.get(cur) ?? 0) + (Number(r.total_price) || 0));
  }
  return {
    count: rows.length,
    totals: Array.from(byCurrency, ([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 })),
  };
}

/** Splits a list for bulk actions so each server call stays short. */
export function chunkIds<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
