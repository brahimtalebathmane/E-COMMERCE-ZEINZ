/**
 * Meta's Click-to-WhatsApp attribution window.
 *
 * A click id older than this can still be sent — Meta accepts it — but the
 * campaign will not be credited for the conversion. Both the sale form (which
 * warns the admin) and the dispatcher (which decides whether to attach a click
 * id found on the contact) must use the SAME window, or the UI would promise an
 * attribution the event does not deliver.
 *
 * Deliberately its own module: `orders/actions.ts` is a "use server" file, where
 * Next.js allows only async functions as runtime exports, so the constant cannot
 * live there and be shared.
 */
export const CTWA_ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** True when an ad click is recent enough for Meta to credit the campaign. */
export function isCtwaClickAttributable(
  clickedAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!clickedAt) return false;
  const clickedMs = Date.parse(clickedAt);
  if (!Number.isFinite(clickedMs)) return false;
  const age = now - clickedMs;
  // A click stamped slightly in the future (clock skew on the WhatsApp host) is
  // recent, not invalid.
  return age <= CTWA_ATTRIBUTION_WINDOW_MS;
}
