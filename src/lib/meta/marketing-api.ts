import "server-only";

/** Trims and strips wrapping quotes (mirrors `src/utils/meta.ts`'s env normalization). */
function normalizeEnv(value: string | undefined): string {
  if (!value) return "";
  return value.trim().replace(/^['"]|['"]$/g, "");
}

/** One day's spend for one campaign / ad set, as Meta reported it AND converted to MRU. */
export type CampaignDailySpendEntry = {
  /** Spend converted to MRU via `currency_rates` — this is what gets persisted as `amount`. */
  amountMRU: number;
  /** Spend exactly as Meta reported it, in the ad account's own currency — the record of truth. */
  sourceAmount: number;
  sourceCurrency: string;
};

/** campaignId (or ad set id) -> (YYYY-MM-DD -> spend entry). */
export type CampaignDailySpend = Map<string, Map<string, CampaignDailySpendEntry>>;
export type AdSetDailySpend = CampaignDailySpend;

export type MarketingFailureReason =
  | "missing_credentials"
  | "http_error"
  | "network_error"
  | "rejected"
  | "missing_currency_rate"
  | "truncated";

export type FetchCampaignSpendResult =
  | { ok: true; data: CampaignDailySpend; accountCurrency: string | null }
  | { ok: false; reason: MarketingFailureReason; detail?: string };

export type FetchAccountSpendResult =
  | {
      ok: true;
      /** Ad account id without the "act_" prefix. */
      adAccountId: string;
      /** YYYY-MM-DD -> the account's total spend that day. */
      data: Map<string, CampaignDailySpendEntry>;
      accountCurrency: string | null;
    }
  | { ok: false; reason: MarketingFailureReason; detail?: string };

type MarketingCredentialParams = {
  accessToken?: string;
  adAccountId?: string;
  apiVersion?: string;
};

type MarketingConfig = {
  accessToken: string;
  /** "act_<id>" */
  accountPath: string;
  /** "<id>" (no prefix) */
  accountId: string;
  apiVersion: string;
};

function resolveConfig(params: MarketingCredentialParams): MarketingConfig | null {
  const accessToken = normalizeEnv(params.accessToken ?? process.env.META_MARKETING_ACCESS_TOKEN);
  const adAccountId = normalizeEnv(params.adAccountId ?? process.env.META_AD_ACCOUNT_ID);
  if (!accessToken || !adAccountId) {
    console.warn("[meta-marketing] request skipped: missing credentials", {
      hasToken: Boolean(accessToken),
      hasAdAccountId: Boolean(adAccountId),
    });
    return null;
  }
  const apiVersion =
    normalizeEnv(params.apiVersion) ||
    normalizeEnv(process.env.META_MARKETING_API_VERSION) ||
    normalizeEnv(process.env.META_CAPI_VERSION) ||
    "v22.0";
  const accountId = adAccountId.replace(/^act_/, "");
  return { accessToken, accountPath: `act_${accountId}`, accountId, apiVersion };
}

const MISSING_CREDENTIALS = {
  ok: false as const,
  reason: "missing_credentials" as const,
  detail: "META_MARKETING_ACCESS_TOKEN or META_AD_ACCOUNT_ID not set",
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

type InsightsRow = {
  campaign_id?: string;
  adset_id?: string;
  spend?: string;
  date_start?: string;
  account_currency?: string;
};
type InsightsPaging = { next?: string };
type InsightsResponseBody = { data?: InsightsRow[]; paging?: InsightsPaging; error?: { message?: string } };

/** Safety cap against runaway pagination. Hitting it fails the fetch ("truncated"). */
const MAX_INSIGHTS_PAGES = 50;

/**
 * One Insights request (plus pagination) at a given level, summed per
 * `keyOf(row)` and per day. Shared by the campaign, ad set and account
 * fetches so all three keep the same guarantees: time_increment=1, page cap
 * treated as failure, account currency read from the rows and converted only
 * with a rate from `currency_rates` (never invented). Never throws.
 */
async function fetchInsightsDaily(params: {
  config: MarketingConfig;
  level: "campaign" | "adset" | "account";
  fields: string;
  filtering: { field: string; operator: "IN"; value: string[] }[] | null;
  keyOf: (row: InsightsRow) => string | undefined;
  sinceISODate: string;
  untilISODate: string;
  mruPerUnitByCurrency: Map<string, number>;
}): Promise<FetchCampaignSpendResult> {
  const { config } = params;
  const initialUrl = new URL(`https://graph.facebook.com/${config.apiVersion}/${config.accountPath}/insights`);
  initialUrl.searchParams.set("level", params.level);
  initialUrl.searchParams.set("time_increment", "1");
  initialUrl.searchParams.set(
    "time_range",
    JSON.stringify({ since: params.sinceISODate, until: params.untilISODate }),
  );
  initialUrl.searchParams.set("fields", params.fields);
  if (params.filtering) initialUrl.searchParams.set("filtering", JSON.stringify(params.filtering));
  initialUrl.searchParams.set("limit", "500");
  initialUrl.searchParams.set("access_token", config.accessToken);

  const result: CampaignDailySpend = new Map();
  let nextUrl: string | null = initialUrl.toString();
  let pageCount = 0;
  let accountCurrency: string | null = null;
  let mruPerUnit: number | null = null;

  try {
    while (nextUrl && pageCount < MAX_INSIGHTS_PAGES) {
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
          level: params.level,
          status: res.status,
          body: body.slice(0, 500),
        });
        return {
          ok: false,
          reason: res.status === 401 || res.status === 403 ? "rejected" : "http_error",
          detail: `level=${params.level} status=${res.status} body=${body.slice(0, 400)}`,
        };
      }

      for (const row of parsed?.data ?? []) {
        const key = params.keyOf(row);
        const dateKey = row.date_start;
        const spendRaw = Number(row.spend);
        if (!key || !dateKey || !Number.isFinite(spendRaw)) continue;

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
        const byDate = result.get(key) ?? new Map<string, CampaignDailySpendEntry>();
        const existing = byDate.get(dateKey);
        byDate.set(dateKey, {
          amountMRU: (existing?.amountMRU ?? 0) + spendMRU,
          sourceAmount: (existing?.sourceAmount ?? 0) + spendRaw,
          sourceCurrency: accountCurrency,
        });
        result.set(key, byDate);
      }

      nextUrl = parsed?.paging?.next ?? null;
      pageCount += 1;
    }

    // Stopping at the page cap with more pages still available means the
    // sync is a PARTIAL window, not a complete one — an understated "success"
    // here would get written as confident (possibly zero) daily spend and
    // never be retried (see A13). Treat it as a failure so cached data wins.
    if (nextUrl && pageCount >= MAX_INSIGHTS_PAGES) {
      return {
        ok: false,
        reason: "truncated",
        detail: `Insights pagination (level=${params.level}) hit the page cap; treating as failed rather than a partial sync.`,
      };
    }

    return { ok: true, data: result, accountCurrency };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[meta-marketing] Insights request error", { level: params.level, error: errMsg });
    return { ok: false, reason: "network_error", detail: errMsg };
  }
}

type DailySpendParams = MarketingCredentialParams & {
  sinceISODate: string;
  untilISODate: string;
  /** code (ISO, uppercase) -> MRU per unit, from `currency_rates`. No rate is
   *  invented: a currency absent here fails the fetch instead of guessing. */
  mruPerUnitByCurrency: Map<string, number>;
};

/**
 * Per-day spend for a set of Meta campaigns, in ONE batched request (plus
 * pagination) covering all campaign ids together — this stays a single call
 * per sync however many products are linked, which keeps API usage low.
 * Never throws; failures come back as a structured result so callers can
 * keep cached data instead of crashing the dashboard.
 */
export async function fetchCampaignDailySpend(
  params: DailySpendParams & { campaignIds: string[] },
): Promise<FetchCampaignSpendResult> {
  const campaignIds = [...new Set(params.campaignIds.filter(Boolean))];
  if (campaignIds.length === 0) return { ok: true, data: new Map(), accountCurrency: null };
  const config = resolveConfig(params);
  if (!config) return MISSING_CREDENTIALS;
  return fetchInsightsDaily({
    config,
    level: "campaign",
    fields: "campaign_id,spend,account_currency",
    filtering: [{ field: "campaign.id", operator: "IN", value: campaignIds }],
    keyOf: (row) => row.campaign_id,
    sinceISODate: params.sinceISODate,
    untilISODate: params.untilISODate,
    mruPerUnitByCurrency: params.mruPerUnitByCurrency,
  });
}

/**
 * Per-day spend for a set of ad sets (level=adset), in ONE batched request
 * for all of them. Separate from the campaign request because Insights
 * filtering is AND-only: "campaign.id IN … OR adset.id IN …" can't be said
 * in one call. Same guarantees as `fetchCampaignDailySpend`.
 */
export async function fetchAdSetDailySpend(
  params: DailySpendParams & { adSetIds: string[] },
): Promise<FetchCampaignSpendResult> {
  const adSetIds = [...new Set(params.adSetIds.filter(Boolean))];
  if (adSetIds.length === 0) return { ok: true, data: new Map(), accountCurrency: null };
  const config = resolveConfig(params);
  if (!config) return MISSING_CREDENTIALS;
  return fetchInsightsDaily({
    config,
    level: "adset",
    fields: "adset_id,campaign_id,spend,account_currency",
    filtering: [{ field: "adset.id", operator: "IN", value: adSetIds }],
    keyOf: (row) => row.adset_id,
    sinceISODate: params.sinceISODate,
    untilISODate: params.untilISODate,
    mruPerUnitByCurrency: params.mruPerUnitByCurrency,
  });
}

/** The whole ad account's spend per day (level=account), for the unattributed-spend check. */
export async function fetchAccountDailySpend(params: DailySpendParams): Promise<FetchAccountSpendResult> {
  const config = resolveConfig(params);
  if (!config) return MISSING_CREDENTIALS;
  const res = await fetchInsightsDaily({
    config,
    level: "account",
    fields: "spend,account_currency",
    filtering: null,
    keyOf: () => "account",
    sinceISODate: params.sinceISODate,
    untilISODate: params.untilISODate,
    mruPerUnitByCurrency: params.mruPerUnitByCurrency,
  });
  if (!res.ok) return res;
  return {
    ok: true,
    adAccountId: config.accountId,
    data: res.data.get("account") ?? new Map(),
    accountCurrency: res.accountCurrency,
  };
}

type GraphErrorBody = { error?: { message?: string; code?: number } };

export type FetchAdSetInfoResult =
  | { ok: true; adSetId: string; campaignId: string; name: string | null }
  | {
      ok: false;
      reason: "missing_credentials" | "not_found" | "other_account" | "rejected" | "http_error" | "network_error";
      detail?: string;
    };

/**
 * Looks one ad set up on Meta (GET /{adset_id}?fields=campaign_id,name,account_id)
 * before it is linked: the campaign id stored with the link comes from here,
 * never from user input, and an id that doesn't exist or belongs to another
 * ad account is refused.
 */
export async function fetchAdSetInfo(
  adSetId: string,
  credentials: MarketingCredentialParams = {},
): Promise<FetchAdSetInfoResult> {
  const id = adSetId.trim();
  if (!/^[0-9]+$/.test(id)) return { ok: false, reason: "not_found", detail: "Ad set id must be digits only." };
  const config = resolveConfig(credentials);
  if (!config) return MISSING_CREDENTIALS;

  const url = new URL(`https://graph.facebook.com/${config.apiVersion}/${id}`);
  url.searchParams.set("fields", "campaign_id,name,account_id");
  url.searchParams.set("access_token", config.accessToken);

  try {
    const res = await safeInsightsFetch(url.toString());
    const body = await res.text().catch(() => "");
    let parsed: (GraphErrorBody & { id?: string; campaign_id?: string; name?: string; account_id?: string }) | null = null;
    try {
      parsed = body ? JSON.parse(body) : null;
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      // Graph answers an unknown / inaccessible object id with 400 + code 100.
      if (res.status === 400 || res.status === 404) {
        return { ok: false, reason: "not_found", detail: parsed?.error?.message ?? `status=${res.status}` };
      }
      return {
        ok: false,
        reason: res.status === 401 || res.status === 403 ? "rejected" : "http_error",
        detail: `status=${res.status} body=${body.slice(0, 300)}`,
      };
    }
    const accountId = String(parsed?.account_id ?? "").replace(/^act_/, "");
    const campaignId = String(parsed?.campaign_id ?? "");
    if (!campaignId || !accountId) {
      return { ok: false, reason: "not_found", detail: "Meta did not return campaign_id/account_id for this id (not an ad set?)." };
    }
    if (accountId !== config.accountId) {
      return { ok: false, reason: "other_account", detail: `Ad set belongs to account ${accountId}.` };
    }
    return { ok: true, adSetId: String(parsed?.id ?? id), campaignId, name: parsed?.name?.trim() || null };
  } catch (error) {
    return { ok: false, reason: "network_error", detail: error instanceof Error ? error.message : String(error) };
  }
}

export type AdSetListItem = {
  id: string;
  name: string;
  campaignId: string;
  campaignName: string | null;
};

export type ListAdSetsResult =
  | { ok: true; adSets: AdSetListItem[]; truncated: boolean }
  | { ok: false; reason: MarketingFailureReason; detail?: string };

/** The ad account's ACTIVE ad sets (name, campaign, id), for the link picker. */
export async function listActiveAdSets(credentials: MarketingCredentialParams = {}): Promise<ListAdSetsResult> {
  const config = resolveConfig(credentials);
  if (!config) return MISSING_CREDENTIALS;

  const initialUrl = new URL(`https://graph.facebook.com/${config.apiVersion}/${config.accountPath}/adsets`);
  initialUrl.searchParams.set("fields", "id,name,campaign_id,campaign{name}");
  initialUrl.searchParams.set("effective_status", JSON.stringify(["ACTIVE"]));
  initialUrl.searchParams.set("limit", "200");
  initialUrl.searchParams.set("access_token", config.accessToken);

  const adSets: AdSetListItem[] = [];
  let nextUrl: string | null = initialUrl.toString();
  let pages = 0;
  try {
    while (nextUrl && pages < 10) {
      const res = await safeInsightsFetch(nextUrl);
      const body = await res.text().catch(() => "");
      if (!res.ok) {
        return {
          ok: false,
          reason: res.status === 401 || res.status === 403 ? "rejected" : "http_error",
          detail: `status=${res.status} body=${body.slice(0, 300)}`,
        };
      }
      const parsed = JSON.parse(body || "{}") as {
        data?: { id?: string; name?: string; campaign_id?: string; campaign?: { name?: string } }[];
        paging?: InsightsPaging;
      };
      for (const row of parsed.data ?? []) {
        if (!row.id || !row.campaign_id) continue;
        adSets.push({
          id: String(row.id),
          name: row.name?.trim() || String(row.id),
          campaignId: String(row.campaign_id),
          campaignName: row.campaign?.name?.trim() || null,
        });
      }
      nextUrl = parsed.paging?.next ?? null;
      pages += 1;
    }
    adSets.sort(
      (x, y) => (x.campaignName ?? "").localeCompare(y.campaignName ?? "") || x.name.localeCompare(y.name),
    );
    return { ok: true, adSets, truncated: Boolean(nextUrl) };
  } catch (error) {
    return { ok: false, reason: "network_error", detail: error instanceof Error ? error.message : String(error) };
  }
}
