import { assertPermission } from "@/lib/auth/admin";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { resolveWhatsAppDatasetDestination } from "@/lib/meta/dispatch";
import {
  DATASET_GAP_LOOKBACK_DAYS,
  loadDatasetGap,
  loadDatasetLastError,
  loadLastDatasetResendRun,
} from "@/lib/meta/dataset-resend";
import { createServiceClient } from "@/lib/supabase/service";
import { adminAr as a } from "@/locales/admin-ar";
import { DatasetGapSection, SignalCoverageSection } from "./WhatsAppDatasetHealthSection";
import { fetchWhatsAppSignalCoverage } from "./queries";
import type { DatasetGapStatus } from "./types";

function PanelError({ label, error }: { label: string; error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <section className="rounded-xl border border-red-400/30 bg-red-400/5 p-4 sm:p-5">
      <p className="text-sm text-red-600">
        {label} {message}
      </p>
    </section>
  );
}

/**
 * The WhatsApp dataset gap, loaded with the service role: the purchase-time
 * lookup reads order_status_history, which has no admin read policy. Gated by
 * the same permission as the page and its actions.
 */
export async function DatasetGapPanel() {
  try {
    await assertPermission(PERMISSIONS.view_meta_monitoring);
    const supabase = createServiceClient();
    const [gap, lastError, lastRun] = await Promise.all([
      loadDatasetGap(supabase),
      loadDatasetLastError(supabase),
      loadLastDatasetResendRun(supabase),
    ]);
    const status: DatasetGapStatus = {
      eligible: gap.eligible.length,
      expired: gap.expiredCount,
      lookbackDays: DATASET_GAP_LOOKBACK_DAYS,
      oldest: gap.eligible[0]?.purchaseAt ?? null,
      newest: gap.eligible[gap.eligible.length - 1]?.purchaseAt ?? null,
      lastError,
      lastRun,
      configured: resolveWhatsAppDatasetDestination() != null,
    };
    return <DatasetGapSection status={status} />;
  } catch (error) {
    return <PanelError label={a.meta.gapLoadError} error={error} />;
  }
}

export async function SignalCoveragePanel() {
  try {
    await assertPermission(PERMISSIONS.view_meta_monitoring);
    const coverage = await fetchWhatsAppSignalCoverage(createServiceClient());
    return <SignalCoverageSection coverage={coverage} />;
  } catch (error) {
    return <PanelError label={a.meta.coverageLoadError} error={error} />;
  }
}
