import { createClient } from "@/lib/supabase/server";
import { adminAr as a } from "@/locales/admin-ar";
import { getCountryScope } from "@/lib/auth/country-scope";
import { AnalyticsView } from "./AnalyticsView";
import { AffiliateAnalyticsSection } from "./AffiliateAnalyticsSection";
import { loadAnalyticsData, loadAffiliateAnalyticsData } from "./data";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  const supabase = await createClient();
  const { selectedCountryId } = await getCountryScope();
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
    <div className="space-y-8">
      <AnalyticsView data={result.data} />
      {affiliateResult.ok ? <AffiliateAnalyticsSection data={affiliateResult.data} /> : null}
    </div>
  );
}
