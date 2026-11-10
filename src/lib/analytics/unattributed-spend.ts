/**
 * Spend the ad account paid that no linked campaign or ad set accounts for.
 * Pure (no server imports) so the profits page can filter it by period on the
 * client.
 *
 * Compared in the ad account's own currency (source_amount), not MRU: the MRU
 * amounts are rounded per product-day, the source amounts are not, so the
 * comparison has no rounding noise.
 */

export type UnattributedDay = {
  date: string;
  /** Account total that day, in the account currency. */
  accountSource: number;
  /** Sum attributed to products that day, in the account currency. */
  attributedSource: number;
  /** account − attributed. Negative means MORE was attributed than spent (double counting). */
  unattributedSource: number;
  currency: string;
  /** unattributedSource converted to MRU with the same rate the sync used. */
  unattributedMRU: number;
};

/** Below this (in the account currency, e.g. USD) a difference is noise, not a missing link. */
export const UNATTRIBUTED_MIN_SOURCE = 0.5;
/** …and below this share of the day's account total. */
export const UNATTRIBUTED_MIN_SHARE = 0.02;

export function isUnattributedSignificant(day: Pick<UnattributedDay, "accountSource" | "unattributedSource">): boolean {
  const abs = Math.abs(day.unattributedSource);
  return abs >= UNATTRIBUTED_MIN_SOURCE && abs >= UNATTRIBUTED_MIN_SHARE * Math.max(day.accountSource, 0);
}

export function computeUnattributedDaily(params: {
  accountRows: { date: string; amount: number; source_amount: number; source_currency: string | null }[];
  productRows: { date: string; source_amount: number | null; source_currency: string | null }[];
}): UnattributedDay[] {
  const attributed = new Map<string, number>();
  const attributedCurrency = new Map<string, Set<string>>();
  for (const r of params.productRows) {
    const date = String(r.date);
    attributed.set(date, (attributed.get(date) ?? 0) + (Number(r.source_amount) || 0));
    if (r.source_currency) {
      const set = attributedCurrency.get(date) ?? new Set<string>();
      set.add(r.source_currency.toUpperCase());
      attributedCurrency.set(date, set);
    }
  }

  const out: UnattributedDay[] = [];
  for (const a of params.accountRows) {
    const date = String(a.date);
    const currency = (a.source_currency ?? "").toUpperCase();
    const productCurrencies = attributedCurrency.get(date);
    // Different currencies can't be compared without inventing a rate.
    if (!currency || (productCurrencies && [...productCurrencies].some((c) => c !== currency))) continue;
    const accountSource = Number(a.source_amount) || 0;
    const attributedSource = attributed.get(date) ?? 0;
    const unattributedSource = round2(accountSource - attributedSource);
    const mruPerUnit = accountSource > 0 ? (Number(a.amount) || 0) / accountSource : 0;
    out.push({
      date,
      accountSource: round2(accountSource),
      attributedSource: round2(attributedSource),
      unattributedSource,
      currency,
      unattributedMRU: Math.round(unattributedSource * mruPerUnit),
    });
  }
  return out.sort((x, y) => (x.date < y.date ? 1 : -1));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
