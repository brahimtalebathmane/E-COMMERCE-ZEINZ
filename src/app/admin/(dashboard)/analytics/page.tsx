import { createClient } from "@/lib/supabase/server";
import { adminAr as a } from "@/locales/admin-ar";
import { getCountryScope } from "@/lib/auth/country-scope";
import { hasLocalOperations } from "@/lib/local-operations";
import { createServiceClient } from "@/lib/supabase/service";
import { loadOpexForProfit } from "@/lib/treasury/reconciliation-data";
import { AnalyticsPageClient } from "./AnalyticsPageClient";
import { loadAnalyticsData, loadAffiliateAnalyticsData } from "./data";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const [supabase, { selectedCountryId, selectedCountry }, { period }] = await Promise.all([
    createClient(),
    getCountryScope(),
    searchParams,
  ]);
  const [result, affiliateResult, opex] = await Promise.all([
    loadAnalyticsData(supabase, selectedCountryId),
    loadAffiliateAnalyticsData(supabase, selectedCountryId),
    // Operating expenses from the treasury (Mauritania only, once it is live).
    // A failure here must not take the profits page down with it.
    hasLocalOperations(selectedCountry)
      ? loadOpexForProfit(createServiceClient(), selectedCountryId).catch(() => null)
      : Promise.resolve(null),
  ]);

  if (!result.ok) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">{a.analytics.title}</h1>
        <p className="mt-4 text-sm text-red-600">
          {a.orders.loadError} {result.error}
        </p>
      </div>
    );
  }

  return (
    <AnalyticsPageClient
      data={result.data}
      affiliateData={affiliateResult.ok ? affiliateResult.data : null}
      opex={opex}
      initialPeriod={period}
    />
  );
}
