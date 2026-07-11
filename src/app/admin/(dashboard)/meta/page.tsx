import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { adminAr as a } from "@/locales/admin-ar";
import { MetaMonitoringView } from "./MetaMonitoringView";
import { MetaOverviewPanel } from "./MetaOverviewPanel";
import { MetaOverviewSkeleton } from "./MetaOverviewSection";
import { fetchMetaEventLogPage } from "./queries";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ order?: string; event?: string }>;
};

export default async function AdminMetaPage({ searchParams }: Props) {
  const params = await searchParams;
  const orderFilter = params.order?.trim() ?? params.event?.trim() ?? "";

  const supabase = await createClient();

  try {
    const logPage = await fetchMetaEventLogPage(supabase, {
      page: 1,
      pageSize: 50,
      search: orderFilter || undefined,
    });

    return (
      <div>
        <h1 className="text-2xl font-semibold">{a.meta.title}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{a.meta.subtitle}</p>
        <div className="mt-6 space-y-6">
          <Suspense fallback={<MetaOverviewSkeleton />}>
            <MetaOverviewPanel />
          </Suspense>
          <MetaMonitoringView
            initialRows={logPage.rows}
            initialTotal={logPage.total}
            initialOrderFilter={orderFilter}
          />
        </div>
      </div>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      <div>
        <h1 className="text-2xl font-semibold">{a.meta.title}</h1>
        <p className="mt-4 text-sm text-red-600">
          {a.meta.loadError} {message}
        </p>
      </div>
    );
  }
}
