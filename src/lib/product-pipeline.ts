import type { ProductTestingStatus, ProductSourcingType } from "@/types";

/** Selling price used for COD margin (discount when set). */
export function effectiveSellingPrice(
  price: number,
  discountPrice: number | null | undefined,
): number {
  if (
    discountPrice != null &&
    Number.isFinite(discountPrice) &&
    discountPrice > 0
  ) {
    return discountPrice;
  }
  return price;
}

/** Expected COD margin %: ((price - cost) / price) * 100 */
export function codMarginPercent(
  price: number,
  discountPrice: number | null | undefined,
  costPrice: number | null | undefined,
): number | null {
  const sell = effectiveSellingPrice(price, discountPrice);
  if (
    !Number.isFinite(sell) ||
    sell <= 0 ||
    costPrice == null ||
    !Number.isFinite(costPrice)
  ) {
    return null;
  }
  return ((sell - costPrice) / sell) * 100;
}

export function sourcingTypeLabel(
  type: ProductSourcingType | null | undefined,
): string {
  if (type === "local") return "محلي";
  if (type === "import") return "استيراد";
  return "—";
}

export const PIPELINE_TABS = [
  { id: "research" as const, label: "البحث والتقصي" },
  { id: "ready" as const, label: "جاهز للاختبار" },
  { id: "winner" as const, label: "المنتجات النشطة / الفائزة" },
  { id: "failed" as const, label: "غير صالحة / الفاشلة" },
];

export type PipelineTabId = (typeof PIPELINE_TABS)[number]["id"];

export function filterProductsByTab<T extends { test_status: ProductTestingStatus }>(
  rows: T[],
  tab: PipelineTabId,
): T[] {
  switch (tab) {
    case "research":
      return rows.filter((p) => p.test_status === "under_research");
    case "ready":
      return rows.filter(
        (p) => p.test_status === "ready_for_test" || p.test_status === "testing",
      );
    case "winner":
      return rows.filter((p) => p.test_status === "winner");
    case "failed":
      return rows.filter((p) => p.test_status === "failed");
    default:
      return rows;
  }
}
