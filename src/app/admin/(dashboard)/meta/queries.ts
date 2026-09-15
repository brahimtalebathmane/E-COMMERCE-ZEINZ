import type { SupabaseClient } from "@supabase/supabase-js";
import { countStuckEventsFast } from "@/lib/meta/stuck-events";
import { isRevenueStatus } from "@/lib/analytics/profit";
import type { OrderStatus } from "@/types";
import type { CtwaAdPerformance, CtwaAdPerformanceRow, MetaEventLogRow, MetaOverviewStats } from "./types";

export const META_EVENT_LOG_SELECT =
  "id, event_type, order_id, product_id, event_id, state, reason, detail, attempt_count, created_at";

const DISPATCH_EVENT_TYPES = [
  "lead",
  "purchase",
  "cancelled_lead",
  "initiate_checkout",
  "view_content",
  "config_health",
  "emq_check",
  "pixel_load_failure",
] as const;

export async function fetchMetaOverview(
  supabase: SupabaseClient,
): Promise<MetaOverviewStats> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [failedRes, skippedRes, successRes, stuckCount] = await Promise.all([
    supabase
      .from("meta_event_log")
      .select("id", { count: "exact", head: true })
      .eq("state", "failed")
      .gte("created_at", since24h),
    supabase
      .from("meta_event_log")
      .select("id", { count: "exact", head: true })
      .eq("state", "skipped")
      .gte("created_at", since24h),
    supabase
      .from("meta_event_log")
      .select("id", { count: "exact", head: true })
      .eq("state", "success")
      .gte("created_at", since24h),
    countStuckEventsFast(supabase),
  ]);

  const lastSuccessByType: Record<string, string | null> = {};
  await Promise.all(
    DISPATCH_EVENT_TYPES.map(async (eventType) => {
      const { data } = await supabase
        .from("meta_event_log")
        .select("created_at")
        .eq("event_type", eventType)
        .eq("state", "success")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      lastSuccessByType[eventType] = data?.created_at ?? null;
    }),
  );

  return {
    failures24h: failedRes.count ?? 0,
    skips24h: skippedRes.count ?? 0,
    successes24h: successRes.count ?? 0,
    stuckCount,
    lastSuccessByType,
  };
}

/** Safety cap — this store's volume is in the hundreds; a wider range degrades to a partial view rather than a slow page. */
const CTWA_REPORT_ROW_CAP = 5000;

/**
 * "Which Click-to-WhatsApp ad produced which sale."
 *
 * Two independent funnels joined on the Meta ad id:
 *  - conversations: rows in `whatsapp_ad_clicks` (someone clicked the ad and wrote)
 *  - orders: rows in `orders` carrying `meta_ad_source_id` (that chat became a sale)
 *
 * Deliberately NOT a SQL join: the two sides answer different questions and a
 * click with no order is exactly the row the report exists to surface.
 *
 * Aggregation happens in JS because supabase-js has no GROUP BY; at this store's
 * volume that is cheaper than adding an RPC, and the row cap keeps it bounded.
 */
export async function fetchCtwaAdPerformance(
  supabase: SupabaseClient,
  rangeDays = 30,
): Promise<CtwaAdPerformance> {
  const days = Number.isFinite(rangeDays) && rangeDays > 0 ? Math.floor(rangeDays) : 30;
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [clicksRes, ordersRes] = await Promise.all([
    supabase
      .from("whatsapp_ad_clicks")
      .select("ad_source_id")
      .not("ad_source_id", "is", null)
      .gte("clicked_at", sinceIso)
      .limit(CTWA_REPORT_ROW_CAP),
    supabase
      .from("orders")
      .select("meta_ad_source_id, status, total_price, currency")
      .not("meta_ad_source_id", "is", null)
      .is("deleted_at", null)
      .gte("created_at", sinceIso)
      .limit(CTWA_REPORT_ROW_CAP),
  ]);

  if (clicksRes.error) throw new Error(clicksRes.error.message);
  if (ordersRes.error) throw new Error(ordersRes.error.message);

  const byAd = new Map<string, CtwaAdPerformanceRow>();
  const ensure = (adSourceId: string): CtwaAdPerformanceRow => {
    let row = byAd.get(adSourceId);
    if (!row) {
      row = {
        adSourceId,
        conversations: 0,
        orders: 0,
        confirmed: 0,
        cancelled: 0,
        revenue: 0,
        currency: "",
      };
      byAd.set(adSourceId, row);
    }
    return row;
  };

  for (const click of clicksRes.data ?? []) {
    const id = (click.ad_source_id as string | null)?.trim();
    if (id) ensure(id).conversations += 1;
  }

  for (const order of ordersRes.data ?? []) {
    const id = (order.meta_ad_source_id as string | null)?.trim();
    if (!id) continue;
    const row = ensure(id);
    row.orders += 1;
    const status = order.status as string;
    if (status === "cancelled") {
      row.cancelled += 1;
      continue;
    }
    // Realized revenue only — same definition profit.ts uses (shipped only),
    // so this report and /admin/analytics never disagree about the same orders.
    if (isRevenueStatus(status as OrderStatus)) {
      row.confirmed += 1;
      const value = Number(order.total_price);
      if (Number.isFinite(value)) row.revenue += value;
      // One ad belongs to one market, so its orders share a currency; the first
      // non-empty one is the row's currency.
      if (!row.currency) row.currency = (order.currency as string | null)?.trim() || "";
    }
  }

  const rows = [...byAd.values()].sort(
    (x, y) => y.revenue - x.revenue || y.conversations - x.conversations,
  );

  // Grouped by currency — never summed across currencies into one number
  // (each row already carries a single currency; this just avoids collapsing
  // several currencies' rows into one mixed total).
  const revenueByCurrency = new Map<string, number>();
  for (const r of rows) {
    const code = r.currency || "—";
    revenueByCurrency.set(code, (revenueByCurrency.get(code) ?? 0) + r.revenue);
  }

  return {
    rangeDays: days,
    rows,
    totalConversations: rows.reduce((sum, r) => sum + r.conversations, 0),
    totalOrders: rows.reduce((sum, r) => sum + r.orders, 0),
    totalConfirmed: rows.reduce((sum, r) => sum + r.confirmed, 0),
    totalRevenueByCurrency: Array.from(revenueByCurrency.entries()).map(([currency, revenue]) => ({
      currency,
      revenue,
    })),
    truncated:
      (clicksRes.data?.length ?? 0) >= CTWA_REPORT_ROW_CAP ||
      (ordersRes.data?.length ?? 0) >= CTWA_REPORT_ROW_CAP,
  };
}

export type MetaLogQueryParams = {
  page: number;
  pageSize: number;
  eventType?: string;
  state?: string;
  search?: string;
  from?: string;
  to?: string;
};

export async function fetchMetaEventLogPage(
  supabase: SupabaseClient,
  params: MetaLogQueryParams,
): Promise<{ rows: MetaEventLogRow[]; total: number }> {
  const page = Math.max(1, params.page);
  const pageSize = Math.min(100, Math.max(10, params.pageSize));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("meta_event_log")
    .select(META_EVENT_LOG_SELECT, { count: "exact" })
    .order("created_at", { ascending: false });

  if (params.eventType && params.eventType !== "all") {
    query = query.eq("event_type", params.eventType);
  }
  if (params.state && params.state !== "all") {
    query = query.eq("state", params.state);
  }
  if (params.from) {
    query = query.gte("created_at", params.from);
  }
  if (params.to) {
    query = query.lte("created_at", params.to);
  }
  if (params.search?.trim()) {
    const term = params.search.trim();
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(term)) {
      query = query.or(
        `order_id.eq.${term},product_id.eq.${term},event_id.eq.${term}`,
      );
    } else {
      query = query.ilike("event_id", `%${term}%`);
    }
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw new Error(error.message);

  return {
    rows: (data ?? []) as MetaEventLogRow[],
    total: count ?? 0,
  };
}
