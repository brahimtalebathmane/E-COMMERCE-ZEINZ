import type { Locale } from "@/lib/i18n";
import { mapApiErrorToKey, translate } from "@/lib/i18n";

export function translateErrorMessage(
  locale: Locale,
  raw: string,
): string {
  const key = mapApiErrorToKey(raw);
  if (key) return translate(locale, key);
  return raw;
}
