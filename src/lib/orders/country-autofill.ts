import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * When the Phase A code (every insert path sends orders.country_id) went
 * live. Orders created before this were filled by the transitional trigger on
 * purpose; any autofill AFTER it means an insert path forgot country_id.
 */
export const COUNTRY_ID_CODE_LIVE_AT = "2026-10-07T01:54:00Z";

/**
 * Number of orders created after the Phase A deploy whose insert did not send
 * country_id (the trigger filled it from the product — see migrations 068/069).
 * Expected to stay 0. Service role only: the log has RLS and no policies.
 */
export async function countLateCountryAutofills(service: SupabaseClient): Promise<number> {
  const { count, error } = await service
    .from("orders_country_id_autofill_log")
    .select("order_id", { count: "exact", head: true })
    .gte("filled_at", COUNTRY_ID_CODE_LIVE_AT);
  if (error) {
    console.error("[country-autofill] could not read the autofill log", error.message);
    return 0;
  }
  return count ?? 0;
}
