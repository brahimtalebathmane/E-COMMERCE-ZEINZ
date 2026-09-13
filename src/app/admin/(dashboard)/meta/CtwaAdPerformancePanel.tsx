import { createClient } from "@/lib/supabase/server";
import { adminAr as a } from "@/locales/admin-ar";
import { CtwaAdPerformanceSection } from "./CtwaAdPerformanceSection";
import { fetchCtwaAdPerformance } from "./queries";

/**
 * Streams in behind its own Suspense boundary so a slow (or failing) attribution
 * query never delays the event log, which is the page's primary content.
 */
export async function CtwaAdPerformancePanel() {
  const supabase = await createClient();

  try {
    const report = await fetchCtwaAdPerformance(supabase, 30);
    return <CtwaAdPerformanceSection report={report} />;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      <section className="rounded-xl border border-red-400/30 bg-red-400/5 p-4 sm:p-5">
        <p className="text-sm text-red-600">
          {a.meta.ctwaLoadError} {message}
        </p>
      </section>
    );
  }
}
