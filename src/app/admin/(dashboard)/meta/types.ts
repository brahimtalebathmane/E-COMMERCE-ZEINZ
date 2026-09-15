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

/** One Click-to-WhatsApp ad, from click through to booked revenue. */
export type CtwaAdPerformanceRow = {
  /** Meta ad id, from externalAdReply.sourceId on the inbound message. */
  adSourceId: string;
  /** Chats opened from this ad (rows in whatsapp_ad_clicks). */
  conversations: number;
  orders: number;
  /** Orders that reached "shipped" — the same realized-revenue definition
   *  `isRevenueStatus` uses on /admin/analytics, so the two pages agree. */
  confirmed: number;
  cancelled: number;
  /** Sum of total_price over `confirmed` (shipped orders only). */
  revenue: number;
  currency: string;
};

export type CtwaAdPerformance = {
  rangeDays: number;
  rows: CtwaAdPerformanceRow[];
  totalConversations: number;
  totalOrders: number;
  totalConfirmed: number;
  /** Realized (shipped) revenue, grouped by currency — never summed across
   *  currencies into one mixed number. Each ad's own row already carries a
   *  single currency (one ad belongs to one market); this is the report-level
   *  total, which used to silently mix them. */
  totalRevenueByCurrency: { currency: string; revenue: number }[];
  /** True when either source hit the row cap — the numbers are a partial view. */
  truncated: boolean;
};
