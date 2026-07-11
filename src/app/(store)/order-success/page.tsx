import { cookies } from "next/headers";
import {
  ORDER_SUCCESS_AT_COOKIE,
  ORDER_SUCCESS_CT_COOKIE,
  ORDER_SUCCESS_OID_COOKIE,
} from "@/lib/orders/order-success-session";
import { loadOrderSuccessContext } from "@/lib/orders/order-success-context";
import { OrderSuccessContent } from "./OrderSuccessContent";
import { OrderSuccessEffects } from "./OrderSuccessEffects";

type Props = {
  searchParams?: Promise<{
    order_id?: string;
    product_id?: string;
    total_price?: string;
  }>;
};

export default async function OrderSuccessPage({ searchParams }: Props) {
  const sp = searchParams ? await searchParams : undefined;
  const orderId = sp?.order_id?.trim() || null;
  const totalPriceRaw = sp?.total_price?.trim() || "";
  const queryTotalPrice = totalPriceRaw ? Number(totalPriceRaw) : null;

  const cookieStore = await cookies();
  const cookieOrderId = cookieStore.get(ORDER_SUCCESS_OID_COOKIE)?.value?.trim() || null;

  let completionToken: string | null = null;
  let actionToken: string | null = null;

  if (orderId && cookieOrderId === orderId) {
    completionToken = cookieStore.get(ORDER_SUCCESS_CT_COOKIE)?.value?.trim() || null;
    actionToken = cookieStore.get(ORDER_SUCCESS_AT_COOKIE)?.value?.trim() || null;
  }

  const orderContext = await loadOrderSuccessContext(orderId, cookieOrderId);
  const productId = orderContext?.productId ?? sp?.product_id?.trim() ?? null;
  const productName = orderContext?.productName ?? null;
  const totalPrice =
    orderContext?.totalPrice ??
    (typeof queryTotalPrice === "number" && Number.isFinite(queryTotalPrice)
      ? queryTotalPrice
      : null);
  const currency = orderContext?.currency ?? "MRU";

  return (
    <>
      <OrderSuccessEffects
        orderId={orderId}
        completionToken={completionToken}
        actionToken={actionToken}
        productId={productId}
        productName={productName}
        totalPrice={totalPrice}
        currency={currency}
      />
      <OrderSuccessContent
        orderId={orderId}
        productName={productName}
        totalPrice={totalPrice}
      />
    </>
  );
}
