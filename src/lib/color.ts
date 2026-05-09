/** Normalize user-entered hex for CSS / DB (returns `#rrggbb` or `fallback`). */
export function normalizeHexColor(input: string, fallback: string): string {
  const t = input.trim();
  if (/^#[0-9A-Fa-f]{6}$/i.test(t)) return `#${t.slice(1).toLowerCase()}`;
  if (/^[0-9A-Fa-f]{6}$/i.test(t)) return `#${t.toLowerCase()}`;
  return fallback;
}

/** Optional hex: empty stays empty; invalid falls back to `fallback` when non-empty input. */
export function normalizeOptionalHexColor(input: string): string {
  const t = input.trim();
  if (!t) return "";
  if (/^#[0-9A-Fa-f]{6}$/i.test(t)) return `#${t.slice(1).toLowerCase()}`;
  if (/^[0-9A-Fa-f]{6}$/i.test(t)) return `#${t.toLowerCase()}`;
  return "";
}
