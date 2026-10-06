import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { AuthError } from "@/lib/auth/admin";
import { hasLocalOperations } from "@/lib/local-operations";
import type { CountryRow } from "@/types";

export const ADMIN_COUNTRY_COOKIE = "admin_country_id";

export type CountryScope = {
  countries: CountryRow[];
  selectedCountryId: string;
  /** Convenience lookup — same row as `countries.find(c => c.id === selectedCountryId)`. */
  selectedCountry: CountryRow | null;
};

/**
 * Resolves which market the admin dashboard is scoped to for this request.
 * Any admin/staff account may pick any active country (no per-account ACL —
 * deliberate). Defaults to the local-operations market (Mauritania) when the
 * cookie is unset or points at a country that no longer exists/is inactive.
 */
const resolveCountryScope = cache(async (): Promise<CountryScope> => {
  const supabase = await createClient();
  // Any staff role (not just owner) reaches this, so it reads the
  // server-pixel-free `countries_public` view — see
  // supabase/migrations/059_countries_public_view.sql. Owner-only screens
  // that need meta_pixel_id_server go through countries/actions.ts instead.
  const { data } = await supabase
    .from("countries_public")
    .select("*")
    .order("name_ar");
  const countries = (data ?? []) as CountryRow[];

  const cookieStore = await cookies();
  const cookieId = cookieStore.get(ADMIN_COUNTRY_COOKIE)?.value?.trim();
  const homeMarket = countries.find(hasLocalOperations);
  const selected =
    countries.find((c) => c.id === cookieId) ?? homeMarket ?? countries[0] ?? null;

  return { countries, selectedCountryId: selected?.id ?? "", selectedCountry: selected };
});

export async function getCountryScope(): Promise<CountryScope> {
  return resolveCountryScope();
}

export type RequiredCountryScope = {
  countryId: string;
  /** ISO 4217 code of the selected market (countries.currency). */
  currency: string;
  country: CountryRow;
  hasLocalOperations: boolean;
};

/**
 * For server actions: the selected market, or a 403 when none resolves.
 * Never falls back to Mauritania/MRU — an action that can't tell which market
 * it is writing to must not write at all.
 */
export async function requireCountryScope(): Promise<RequiredCountryScope> {
  const { selectedCountry } = await getCountryScope();
  if (!selectedCountry) {
    throw new AuthError(403, "No active country selected.");
  }
  return {
    countryId: selectedCountry.id,
    currency: selectedCountry.currency,
    country: selectedCountry,
    hasLocalOperations: hasLocalOperations(selectedCountry),
  };
}

/** Inventory/treasury (and admin-entered sales): the selected market must have local operations. */
export async function requireLocalOperationsScope(): Promise<RequiredCountryScope> {
  const scope = await requireCountryScope();
  if (!scope.hasLocalOperations) {
    throw new AuthError(403, "This is only available for the local-operations market.");
  }
  return scope;
}

/** Rejects a record (or a client-supplied id resolved to one) that belongs to another market. */
export function assertInCountryScope(
  scope: Pick<RequiredCountryScope, "countryId">,
  rowCountryId: string | null | undefined,
): void {
  if (!rowCountryId || rowCountryId !== scope.countryId) {
    throw new AuthError(403, "This record belongs to another country.");
  }
}
