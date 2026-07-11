import { createClient } from "@/lib/supabase/server";
import { adminAr as a } from "@/locales/admin-ar";
import { MetaOverviewSection } from "./MetaOverviewSection";
import { fetchMetaOverview } from "./queries";

export async function MetaOverviewPanel() {
  const supabase = await createClient();

  try {
    const overview = await fetchMetaOverview(supabase);
    return <MetaOverviewSection overview={overview} />;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      <section className="rounded-xl border border-red-400/30 bg-red-400/5 p-4 sm:p-5">
        <p className="text-sm text-red-600">
          {a.meta.loadError} {message}
        </p>
      </section>
    );
  }
}
