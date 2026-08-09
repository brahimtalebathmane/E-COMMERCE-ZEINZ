import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
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
 * deliberate). Defaults to Mauritania when the cookie is unset or points at
 * a country that no longer exists/is inactive.
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
  const mauritania = countries.find((c) => c.iso_code === "MR");
  const selected =
    countries.find((c) => c.id === cookieId) ?? mauritania ?? countries[0] ?? null;

  return { countries, selectedCountryId: selected?.id ?? "", selectedCountry: selected };
});

export async function getCountryScope(): Promise<CountryScope> {
  return resolveCountryScope();
}
