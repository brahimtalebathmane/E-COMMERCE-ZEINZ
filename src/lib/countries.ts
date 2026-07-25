import { getCountries } from "react-phone-number-input/input";
import type { Country } from "react-phone-number-input";
import en from "react-phone-number-input/locale/en.json";

/**
 * Single source of truth for country code <-> display name, shared by the
 * affiliate product admin form (target-country select), the landing page
 * phone country picker (default country), and the Google Sheets writer
 * (human-readable Country column) — so all three always agree.
 */
export const AFFILIATE_COUNTRIES: { code: Country; name: string }[] = getCountries()
  .map((code) => ({ code, name: (en as Record<string, string>)[code] ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name));

const NAME_BY_CODE = new Map<string, string>(
  AFFILIATE_COUNTRIES.map(({ code, name }) => [code, name]),
);

/** Resolves an ISO 3166-1 alpha-2 code (e.g. "KW") to its English name (e.g. "Kuwait"). */
export function countryNameFromCode(code: string | null | undefined): string {
  if (!code) return "";
  return NAME_BY_CODE.get(code.toUpperCase()) ?? code;
}

/** Mauritania — default country for owned/COD products. */
export const OWNED_DEFAULT_COUNTRY: Country = "MR";
