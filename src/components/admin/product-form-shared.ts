export function moveAt<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  const x = next[i];
  const y = next[j];
  if (x === undefined || y === undefined) return arr;
  next[i] = y;
  next[j] = x;
  return next;
}

export function newRowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type FeatureRow = { ar: string; fr: string };

export type TestimonialDraft = {
  id: string;
  name_ar: string;
  name_fr: string;
  quote_ar: string;
  quote_fr: string;
  role_ar: string;
  role_fr: string;
  image: string;
  rating: string;
  location_ar: string;
  location_fr: string;
};

export type FaqDraft = {
  id: string;
  q_ar: string;
  q_fr: string;
  a_ar: string;
  a_fr: string;
};
