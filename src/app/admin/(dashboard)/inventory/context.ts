import "server-only";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertPermission } from "@/lib/auth/admin";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getCountryScope } from "@/lib/auth/country-scope";
import { hasLocalOperations } from "@/lib/local-operations";
import { createServiceClient } from "@/lib/supabase/service";
import { getInventoryGoLive } from "@/lib/inventory/data";

export type InventoryPageContext =
  | { ok: true; countryId: string; service: SupabaseClient; goLiveAt: string | null }
  | { ok: false; reason: "not_local" };

/**
 * Every inventory page starts here: manage_inventory (also enforced by the
 * middleware route map) and the local-operations market. Selecting Saudi
 * Arabia or Kuwait shows a notice instead of an empty inventory.
 */
export async function getInventoryPageContext(): Promise<InventoryPageContext> {
  try {
    await assertPermission(PERMISSIONS.manage_inventory);
  } catch {
    redirect("/admin?error=forbidden");
  }
  const { selectedCountry } = await getCountryScope();
  if (!selectedCountry || !hasLocalOperations(selectedCountry)) {
    return { ok: false, reason: "not_local" };
  }
  const service = createServiceClient();
  const goLiveAt = await getInventoryGoLive(service, selectedCountry.id);
  return { ok: true, countryId: selectedCountry.id, service, goLiveAt };
}
