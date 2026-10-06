import type { CountryRow } from "@/types";

/**
 * Whether we run local operations (own stock + own cash) in this market —
 * the only gate for inventory and treasury pages, nav links and actions, and
 * for admin-entered (WhatsApp) sales.
 *
 * Reads countries.has_local_operations (migration 067), which a DB check
 * constraint pins to Mauritania. Never test iso_code for this anywhere else.
 */
export function hasLocalOperations(
  country: Pick<CountryRow, "has_local_operations"> | null | undefined,
): boolean {
  return country?.has_local_operations === true;
}
