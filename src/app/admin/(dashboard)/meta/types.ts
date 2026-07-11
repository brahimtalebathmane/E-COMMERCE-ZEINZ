export type MetaEventLogRow = {
  id: string;
  event_type: string;
  order_id: string | null;
  product_id: string | null;
  event_id: string;
  state: "success" | "failed" | "skipped";
  reason: string | null;
  detail: string | null;
  attempt_count: number;
  created_at: string;
};

export type MetaOverviewStats = {
  failures24h: number;
  skips24h: number;
  successes24h: number;
  stuckCount: number;
  lastSuccessByType: Record<string, string | null>;
};

export type MetaMonitoringFilters = {
  eventType: string;
  state: string;
  search: string;
  from: string;
  to: string;
};
