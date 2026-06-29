import { normalizeMetaMatchingNamePart } from "@/lib/meta-user-data";

/** Same normalization as CAPI `hashMetaExternalId` input (trim, lowercase, collapsed spaces). */
export function normalizeMetaExternalId(value: string): string {
  return normalizeMetaMatchingNamePart(value.trim());
}

/**
 * SHA-256 hex digest for Meta Pixel `external_id` — matches server CAPI `hashMetaExternalId`.
 * Meta requires pre-hashed `external_id` in manual advanced matching (unlike ph/fn/ln).
 */
export async function hashMetaExternalId(value: string): Promise<string> {
  const normalized = normalizeMetaExternalId(value);
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
