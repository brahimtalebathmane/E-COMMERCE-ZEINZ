/**
 * Validates a YYYY-MM-DD business-date key for an order: well-formed,
 * parsable, and within [2020-01-01, todayKey] — never in the future, never
 * before the store existed.
 */
export function isValidOrderDateKey(dateKey: string, todayKey: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  if (Number.isNaN(new Date(`${dateKey}T00:00:00Z`).getTime())) return false;
  return dateKey >= "2020-01-01" && dateKey <= todayKey;
}

/**
 * Resolves a chosen business date to the ISO timestamp stored in
 * orders.ordered_at. Today keeps the exact current instant (so a normal,
 * same-day order/edit is indistinguishable from today's created_at); any
 * other day is pinned to noon UTC so it never lands in the neighbouring
 * calendar day. Africa/Nouakchott is fixed UTC+0 with no DST, so noon UTC is
 * exactly noon local.
 */
export function resolveOrderedAtIso(dateKey: string, todayKey: string): string {
  return dateKey === todayKey ? new Date().toISOString() : `${dateKey}T12:00:00.000Z`;
}
