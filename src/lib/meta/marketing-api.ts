import "server-only";

/** Trims and strips wrapping quotes (mirrors `src/utils/meta.ts`'s env normalization). */
function normalizeEnv(value: string | undefined): string {
  if (!value) return "";
  return value.trim().replace(/^['"]|['"]$/g, "");
}

/** campaignId -> (YYYY-MM-DD -> spend amount, in the ad account's reporting currency). */
export type CampaignDailySpend = Map<string, Map<string, number>>;

export type FetchCampaignSpendResult =
  | { ok: true; data: CampaignDailySpend }
  | {
      ok: false;
      reason: "missing_credentials" | "http_error" | "network_error" | "rejected";
      detail?: string;
    };

async function safeInsightsFetch(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { method: "GET", signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

type InsightsRow = { campaign_id?: string; spend?: string; date_start?: string };
type InsightsPaging = { next?: string };
type InsightsResponseBody = { data?: InsightsRow[]; paging?: InsightsPaging; error?: { message?: string } };

/**
 * Fetches per-day spend for a set of Meta campaigns via the Marketing API
 * Insights endpoint, in ONE batched request (plus pagination) covering all
 * campaign ids together — regardless of how many products/campaigns are
 * stale, this stays a single call per sync, which is what keeps API usage low.
 * Never throws; failures are logged and returned as a structured result so
 * callers can fall back to cached data instead of crashing the dashboard.
 */
export async function fetchCampaignDailySpend(params: {
  campaignIds: string[];
  sinceISODate: string;
  untilISODate: string;
  accessToken?: string;
  adAccountId?: string;
  apiVersion?: string;
}): Promise<FetchCampaignSpendResult> {
  const campaignIds = [...new Set(params.campaignIds.filter(Boolean))];
  if (campaignIds.length === 0) {
    return { ok: true, data: new Map() };
  }

  const accessToken = normalizeEnv(params.accessToken ?? process.env.META_MARKETING_ACCESS_TOKEN);
  const adAccountId = normalizeEnv(params.adAccountId ?? process.env.META_AD_ACCOUNT_ID);
  if (!accessToken || !adAccountId) {
    console.warn("[meta-marketing] Insights fetch skipped: missing credentials", {
      hasToken: Boolean(accessToken),
      hasAdAccountId: Boolean(adAccountId),
    });
    return {
      ok: false,
      reason: "missing_credentials",
      detail: "META_MARKETING_ACCESS_TOKEN or META_AD_ACCOUNT_ID not set",
    };
  }

  const apiVersion =
    normalizeEnv(params.apiVersion) ||
    normalizeEnv(process.env.META_MARKETING_API_VERSION) ||
    normalizeEnv(process.env.META_CAPI_VERSION) ||
    "v22.0";

  const accountPath = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const timeRange = JSON.stringify({ since: params.sinceISODate, until: params.untilISODate });
  const filtering = JSON.stringify([{ field: "campaign.id", operator: "IN", value: campaignIds }]);

  const initialUrl = new URL(`https://graph.facebook.com/${apiVersion}/${accountPath}/insights`);
  initialUrl.searchParams.set("level", "campaign");
  initialUrl.searchParams.set("time_increment", "1");
  initialUrl.searchParams.set("time_range", timeRange);
  initialUrl.searchParams.set("fields", "campaign_id,spend");
  initialUrl.searchParams.set("filtering", filtering);
  initialUrl.searchParams.set("limit", "500");
  initialUrl.searchParams.set("access_token", accessToken);

  const result: CampaignDailySpend = new Map();
  let nextUrl: string | null = initialUrl.toString();
  let pageCount = 0;
  const maxPages = 50; // safety cap against runaway pagination

  try {
    while (nextUrl && pageCount < maxPages) {
      const res = await safeInsightsFetch(nextUrl);
      const body = await res.text().catch(() => "");
      let parsed: InsightsResponseBody | null = null;
      try {
        parsed = body ? (JSON.parse(body) as InsightsResponseBody) : null;
      } catch {
        parsed = null;
      }

      if (!res.ok) {
        console.error("[meta-marketing] Insights request failed", {
          status: res.status,
          body: body.slice(0, 500),
        });
        return {
          ok: false,
          reason: res.status === 401 || res.status === 403 ? "rejected" : "http_error",
          detail: `status=${res.status} body=${body.slice(0, 400)}`,
        };
      }

      for (const row of parsed?.data ?? []) {
        const campaignId = row.campaign_id;
        const dateKey = row.date_start;
        const spend = Number(row.spend);
        if (!campaignId || !dateKey || !Number.isFinite(spend)) continue;
        const byDate = result.get(campaignId) ?? new Map<string, number>();
        byDate.set(dateKey, (byDate.get(dateKey) ?? 0) + spend);
        result.set(campaignId, byDate);
      }

      nextUrl = parsed?.paging?.next ?? null;
      pageCount += 1;
    }

    return { ok: true, data: result };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[meta-marketing] Insights request error", { error: errMsg });
    return { ok: false, reason: "network_error", detail: errMsg };
  }
}
