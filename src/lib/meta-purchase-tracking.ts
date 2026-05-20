import { toMetaPixelPurchaseMoney } from "@/lib/currency";

/**
 * Builds Meta Purchase event value/currency from an order total stored in MRU.
 */
export function metaPurchaseMoneyFromOrderTotal(
  totalPriceMru: number,
  orderCurrency = "MRU",
): { value: number; currency: string } {
  return toMetaPixelPurchaseMoney(totalPriceMru, orderCurrency);
}
