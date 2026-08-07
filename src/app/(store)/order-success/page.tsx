import { Suspense } from "react";
import { cookies } from "next/headers";
import {
  ORDER_SUCCESS_AT_COOKIE,
  ORDER_SUCCESS_CT_COOKIE,
  ORDER_SUCCESS_OID_COOKIE,
} from "@/lib/orders/order-success-session";
import { loadOrderSuccessContext, resolveProductNameFromId } from "@/lib/orders/order-success-context";
import { StoreSiteFooter } from "@/components/store/StoreSiteFooter";
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
  const queryProductId = sp?.product_id?.trim() || null;

  // Cheap, synchronous (no network) — safe to read before the shell paints.
  const cookieStore = await cookies();
  const cookieOrderId = cookieStore.get(ORDER_SUCCESS_OID_COOKIE)?.value?.trim() || null;

  let completionToken: string | null = null;
  let actionToken: string | null = null;

  if (orderId && cookieOrderId === orderId) {
    completionToken = cookieStore.get(ORDER_SUCCESS_CT_COOKIE)?.value?.trim() || null;
    actionToken = cookieStore.get(ORDER_SUCCESS_AT_COOKIE)?.value?.trim() || null;
  }

  return (
    <>
      {/* Needs only orderId + the two session tokens — never blocks on the DB lookup below. */}
      <OrderSuccessEffects
        orderId={orderId}
        completionToken={completionToken}
        actionToken={actionToken}
      />
      {/*
        The order/product DB lookup (for productName + fulfillmentType + the
        authoritative currency) is streamed in behind Suspense instead of
        blocking the initial response, so the "thank you" shell paints
        immediately from the query params already on the URL. The fallback
        forces fulfillmentType to "affiliate" (hidden) rather than leaving it
        null (shown) — null would flash the WhatsApp CTA / reassurance rows
        on for a real affiliate order and then yank them away once the true
        value streams in. StoreSiteFooter (hardcodes Mauritanian contact
        info) follows the identical rule: the fallback below renders no
        footer at all, and OrderSuccessSummary only adds one once the real
        fulfillmentType has streamed in and is confirmed not "affiliate" —
        never the reverse, so a Mauritanian footer can't flash on for a
        Saudi COD Partner customer.
      */}
      <Suspense
        fallback={
          <OrderSuccessContent
            orderId={orderId}
            productName={null}
            totalPrice={queryTotalPrice}
            fulfillmentType="affiliate"
            currency={null}
            displayCurrency={null}
          />
        }
      >
        <OrderSuccessSummary
          orderId={orderId}
          cookieOrderId={cookieOrderId}
          queryProductId={queryProductId}
          queryTotalPrice={queryTotalPrice}
        />
      </Suspense>
    </>
  );
}

async function OrderSuccessSummary({
  orderId,
  cookieOrderId,
  queryProductId,
  queryTotalPrice,
}: {
  orderId: string | null;
  cookieOrderId: string | null;
  queryProductId: string | null;
  queryTotalPrice: number | null;
}) {
  const orderContext = await loadOrderSuccessContext(orderId, cookieOrderId);
  let productName = orderContext?.productName ?? null;
  if (!productName && queryProductId) {
    productName = await resolveProductNameFromId(queryProductId);
  }
  const totalPrice =
    orderContext?.totalPrice ??
    (typeof queryTotalPrice === "number" && Number.isFinite(queryTotalPrice)
      ? queryTotalPrice
      : null);
  const currency = orderContext?.currency ?? "MRU";
  const displayCurrency = orderContext?.displayCurrency ?? null;
  const fulfillmentType = orderContext?.fulfillmentType ?? null;

  return (
    <>
      <OrderSuccessContent
        orderId={orderId}
        productName={productName}
        totalPrice={totalPrice}
        fulfillmentType={fulfillmentType}
        currency={currency}
        displayCurrency={displayCurrency}
      />
      {fulfillmentType !== "affiliate" ? <StoreSiteFooter /> : null}
    </>
  );
}
