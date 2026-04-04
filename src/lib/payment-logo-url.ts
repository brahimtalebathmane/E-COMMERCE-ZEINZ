/**
 * Validates optional payment logo URLs: https only, path ending in png/jpg/jpeg/svg.
 * Empty / whitespace-only strings are treated as valid (no logo).
 */
export function isValidPaymentLogoUrl(raw: string): boolean {
  const t = raw.trim();
  if (!t) return true;
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const path = u.pathname.toLowerCase();
    return /\.(png|jpg|jpeg|svg)$/.test(path);
  } catch {
    return false;
  }
}

export function normalizePaymentLogoUrl(raw: string): string | null {
  const t = raw.trim();
  return t ? t : null;
}
