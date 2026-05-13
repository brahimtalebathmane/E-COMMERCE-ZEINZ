import type { Testimonial } from "@/types";

export function parseTestimonialList(raw: unknown): Testimonial[] {
  if (!Array.isArray(raw)) return [];
  const out: Testimonial[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const name = o.name;
    const quote = o.quote;
    if (typeof name !== "string" || typeof quote !== "string") continue;
    const rating = o.rating;
    let r: number | undefined;
    if (typeof rating === "number" && Number.isFinite(rating)) r = rating;
    else if (typeof rating === "string") {
      const n = Number(rating);
      if (Number.isFinite(n)) r = n;
    }
    out.push({
      name,
      quote,
      role: typeof o.role === "string" ? o.role : undefined,
      image: typeof o.image === "string" ? o.image : undefined,
      rating: r !== undefined && r >= 1 && r <= 5 ? r : undefined,
      location: typeof o.location === "string" ? o.location : undefined,
    });
  }
  return out;
}

export type CatalogRatingSummary = {
  average: number;
  count: number;
};

export function ratingSummaryFromTestimonials(
  list: Testimonial[],
): CatalogRatingSummary | null {
  const rated = list.filter(
    (t) => t.rating != null && t.rating >= 1 && t.rating <= 5,
  ) as (Testimonial & { rating: number })[];
  if (rated.length === 0) return null;
  const sum = rated.reduce((acc, t) => acc + t.rating, 0);
  return {
    average: Math.round((sum / rated.length) * 10) / 10,
    count: rated.length,
  };
}
