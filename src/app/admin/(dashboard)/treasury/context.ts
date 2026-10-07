import "server-only";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertAnyPermission } from "@/lib/auth/admin";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getCountryScope } from "@/lib/auth/country-scope";
import { hasLocalOperations } from "@/lib/local-operations";
import { createServiceClient } from "@/lib/supabase/service";
import { getTreasuryGoLive } from "@/lib/treasury/data";

export type TreasuryPageContext =
  | {
      ok: true;
      countryId: string;
      service: SupabaseClient;
      goLive: { goLiveOn: string; goLiveAt: string } | null;
      /** manage_treasury: may record, transfer, settle, reverse. view_treasury alone is read-only. */
      canManage: boolean;
    }
  | { ok: false; reason: "not_local" };

/** Every treasury page: view_treasury or manage_treasury, local-operations market only. */
export async function getTreasuryPageContext(): Promise<TreasuryPageContext> {
  let session;
  try {
    session = await assertAnyPermission([PERMISSIONS.view_treasury, PERMISSIONS.manage_treasury]);
  } catch {
    redirect("/admin?error=forbidden");
  }
  const { selectedCountry } = await getCountryScope();
  if (!selectedCountry || !hasLocalOperations(selectedCountry)) {
    return { ok: false, reason: "not_local" };
  }
  const service = createServiceClient();
  const goLive = await getTreasuryGoLive(service, selectedCountry.id);
  return {
    ok: true,
    countryId: selectedCountry.id,
    service,
    goLive,
    canManage: hasPermission(session.access, PERMISSIONS.manage_treasury),
  };
}
