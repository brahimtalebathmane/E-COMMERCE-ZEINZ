import { createClient } from "@/lib/supabase/server";
import { getCountryScope } from "@/lib/auth/country-scope";
import { adminAr as a } from "@/locales/admin-ar";
import { MarketingView } from "./MarketingView";
import { loadMarketingData } from "./data";

export const dynamic = "force-dynamic";

export default async function AdminMarketingPage() {
  const [supabase, { selectedCountryId }] = await Promise.all([
    createClient(),
    getCountryScope(),
  ]);
  const result = await loadMarketingData(supabase, selectedCountryId);

  if (!result.ok) {
    return (
      <div>
        <h1 className="admin-page-title">{a.marketing.title}</h1>
        <p className="admin-alert-error mt-4">
          {a.marketing.loadError} {result.error}
        </p>
      </div>
    );
  }

  return <MarketingView data={result.data} />;
}
