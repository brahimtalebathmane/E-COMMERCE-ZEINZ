import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { adminAr as a } from "@/locales/admin-ar";
import { AdminPageHeader } from "@/components/admin/ui";
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
      <div className="space-y-6">
        <AdminPageHeader title={a.meta.title} subtitle={a.meta.subtitle} />
        <Suspense fallback={<MetaOverviewSkeleton />}>
          <MetaOverviewPanel />
        </Suspense>
        <MetaMonitoringView
          initialRows={logPage.rows}
          initialTotal={logPage.total}
          initialOrderFilter={orderFilter}
        />
      </div>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      <div className="space-y-4">
        <AdminPageHeader title={a.meta.title} />
        <p className="admin-alert-error">
          {a.meta.loadError} {message}
        </p>
      </div>
    );
  }
}
