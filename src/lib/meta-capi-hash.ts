import "server-only";
import crypto from "crypto";
import {
  META_STORE_COUNTRY_CODE,
  normalizeMetaMatchingCountry,
  normalizeMetaMatchingNamePart,
} from "@/lib/meta-user-data";

/** fn / ln / em / country — lowercase, trimmed, collapsed spaces, then SHA-256. */
export function hashMetaMatchingTextField(value: string): string {
  const normalized = normalizeMetaMatchingNamePart(value);
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

/** ph — E.164 digits only (already normalized), then SHA-256. Do not lowercase digits. */
export function hashMetaMatchingPhone(digits: string): string {
  return crypto.createHash("sha256").update(digits, "utf8").digest("hex");
}

export function hashMetaMatchingCountry(value?: string | null): string {
  return hashMetaMatchingTextField(normalizeMetaMatchingCountry(value));
}

/** external_id — trim, lowercase, SHA-256 (Meta CAPI). */
export function hashMetaExternalId(value: string): string {
  return hashMetaMatchingTextField(value);
}

export { META_STORE_COUNTRY_CODE };
