import { createClient } from "@/lib/supabase/server";
import { adminAr as a } from "@/locales/admin-ar";
import { AnalyticsView } from "./AnalyticsView";
import { loadAnalyticsData } from "./data";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  const supabase = await createClient();
  const result = await loadAnalyticsData(supabase);

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

  return <AnalyticsView data={result.data} />;
}
