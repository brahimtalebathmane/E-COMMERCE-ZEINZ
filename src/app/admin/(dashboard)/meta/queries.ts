import type { SupabaseClient } from "@supabase/supabase-js";
import { countCurrentlyStuck } from "@/lib/meta/stuck-events";
import type { MetaEventLogRow, MetaOverviewStats } from "./types";

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
    countCurrentlyStuck(supabase),
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
