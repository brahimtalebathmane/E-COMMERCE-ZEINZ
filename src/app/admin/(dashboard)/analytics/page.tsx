import { createClient } from "@/lib/supabase/server";
import { adminAr as a } from "@/locales/admin-ar";
import { getCountryScope } from "@/lib/auth/country-scope";
import { AnalyticsPageClient } from "./AnalyticsPageClient";
import { loadAnalyticsData, loadAffiliateAnalyticsData } from "./data";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const [supabase, { selectedCountryId }, { period }] = await Promise.all([
    createClient(),
    getCountryScope(),
    searchParams,
  ]);
  const [result, affiliateResult] = await Promise.all([
    loadAnalyticsData(supabase, selectedCountryId),
    loadAffiliateAnalyticsData(supabase, selectedCountryId),
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
      initialPeriod={period}
    />
  );
}
