import type { ProductTestingStatus } from "@/types";

/** Public landing is hidden only for failed products. */
export const LANDING_VISIBLE_STATUSES: ProductTestingStatus[] = [
  "under_research",
  "ready_for_test",
  "testing",
  "winner",
];

/** Store orders + Meta Lead CAPI: active winner and A/B testing landings. */
export const STORE_ORDER_ELIGIBLE_STATUSES: ProductTestingStatus[] = [
  "winner",
  "ready_for_test",
  "testing",
];

export function isLandingVisible(testStatus: ProductTestingStatus): boolean {
  return testStatus !== "failed";
}

export function canAcceptStoreOrder(testStatus: ProductTestingStatus): boolean {
  return STORE_ORDER_ELIGIBLE_STATUSES.includes(testStatus);
}
