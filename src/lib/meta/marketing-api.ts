import "server-only";

/** Trims and strips wrapping quotes (mirrors `src/utils/meta.ts`'s env normalization). */
function normalizeEnv(value: string | undefined): string {
  if (!value) return "";
  return value.trim().replace(/^['"]|['"]$/g, "");
}

/** One day's spend for one campaign, as Meta reported it AND converted to MRU. */
export type CampaignDailySpendEntry = {
  /** Spend converted to MRU via `currency_rates` — this is what gets persisted as `amount`. */
  amountMRU: number;
  /** Spend exactly as Meta reported it, in the ad account's own currency — the record of truth. */
  sourceAmount: number;
  sourceCurrency: string;
};

/** campaignId -> (YYYY-MM-DD -> spend entry). */
export type CampaignDailySpend = Map<string, Map<string, CampaignDailySpendEntry>>;

export type FetchCampaignSpendResult =
  | { ok: true; data: CampaignDailySpend; accountCurrency: string | null }
  | {
      ok: false;
      reason: "missing_credentials" | "http_error" | "network_error" | "rejected" | "missing_currency_rate" | "truncated";
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

type InsightsRow = { campaign_id?: string; spend?: string; date_start?: string; account_currency?: string };
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
  /** code (ISO, uppercase) -> MRU per unit, from `currency_rates`. No rate is
   *  invented: a currency absent here fails the fetch instead of guessing. */
  mruPerUnitByCurrency: Map<string, number>;
  accessToken?: string;
  adAccountId?: string;
  apiVersion?: string;
}): Promise<FetchCampaignSpendResult> {
  const campaignIds = [...new Set(params.campaignIds.filter(Boolean))];
  if (campaignIds.length === 0) {
    return { ok: true, data: new Map(), accountCurrency: null };
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
  initialUrl.searchParams.set("fields", "campaign_id,spend,account_currency");
  initialUrl.searchParams.set("filtering", filtering);
  initialUrl.searchParams.set("limit", "500");
  initialUrl.searchParams.set("access_token", accessToken);

  const result: CampaignDailySpend = new Map();
  let nextUrl: string | null = initialUrl.toString();
  let pageCount = 0;
  const maxPages = 50; // safety cap against runaway pagination
  let accountCurrency: string | null = null;
  let mruPerUnit: number | null = null;

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
        const spendRaw = Number(row.spend);
        if (!campaignId || !dateKey || !Number.isFinite(spendRaw)) continue;

        // Insights `spend` is denominated in the ad account's own currency —
        // resolve and validate it once, from the first row seen. Never fall
        // back to a hardcoded rate: a currency this store hasn't recorded a
        // rate for fails the whole fetch instead of silently mis-converting.
        if (accountCurrency === null) {
          accountCurrency = (row.account_currency || "").trim().toUpperCase();
          if (!accountCurrency) {
            return {
              ok: false,
              reason: "rejected",
              detail: "Meta did not report account_currency on the Insights row.",
            };
          }
          const rate = params.mruPerUnitByCurrency.get(accountCurrency);
          if (rate == null) {
            return {
              ok: false,
              reason: "missing_currency_rate",
              detail: `No currency_rates row for ${accountCurrency} — refusing to invent a rate.`,
            };
          }
          mruPerUnit = rate;
        }

        const spendMRU = spendRaw * (mruPerUnit as number);
        const byDate = result.get(campaignId) ?? new Map<string, CampaignDailySpendEntry>();
        const existing = byDate.get(dateKey);
        byDate.set(dateKey, {
          amountMRU: (existing?.amountMRU ?? 0) + spendMRU,
          sourceAmount: (existing?.sourceAmount ?? 0) + spendRaw,
          sourceCurrency: accountCurrency,
        });
        result.set(campaignId, byDate);
      }

      nextUrl = parsed?.paging?.next ?? null;
      pageCount += 1;
    }

    // Stopping at the page cap with more pages still available means the
    // sync is a PARTIAL window, not a complete one — an understated "success"
    // here would get written as confident (possibly zero) daily spend and
    // never be retried (see A13). Treat it as a failure so cached data wins.
    if (nextUrl && pageCount >= maxPages) {
      return {
        ok: false,
        reason: "truncated",
        detail: "Insights pagination hit the page cap; treating as failed rather than a partial sync.",
      };
    }

    return { ok: true, data: result, accountCurrency };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[meta-marketing] Insights request error", { error: errMsg });
    return { ok: false, reason: "network_error", detail: errMsg };
  }
}
