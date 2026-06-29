import { cookies } from "next/headers";
import { MetaPixel } from "@/components/MetaPixel";
import { MetaPixelRuntime } from "@/components/MetaPixelRuntime";
import { resolveServerMetaPixelId } from "@/lib/meta-pixel-id";
import {
  ORDER_SUCCESS_AT_COOKIE,
  ORDER_SUCCESS_CT_COOKIE,
  ORDER_SUCCESS_OID_COOKIE,
} from "@/lib/orders/order-success-session";
import { getProductById } from "@/lib/products";
import { OrderSuccessClient } from "./OrderSuccessClient";
import { OrderSuccessContent } from "./OrderSuccessContent";
import { OrderSuccessMetaLead } from "./OrderSuccessMetaLead";

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
  const productId = sp?.product_id?.trim() || null;
  const totalPriceRaw = sp?.total_price?.trim() || "";
  const totalPrice = totalPriceRaw ? Number(totalPriceRaw) : null;

  const cookieStore = await cookies();
  const cookieOrderId = cookieStore.get(ORDER_SUCCESS_OID_COOKIE)?.value?.trim() || null;

  let completionToken: string | null = null;
  let actionToken: string | null = null;

  if (orderId && cookieOrderId === orderId) {
    completionToken = cookieStore.get(ORDER_SUCCESS_CT_COOKIE)?.value?.trim() || null;
    actionToken = cookieStore.get(ORDER_SUCCESS_AT_COOKIE)?.value?.trim() || null;
  }

  const product = productId ? await getProductById(productId) : null;
  const metaPixelId = resolveServerMetaPixelId(product?.meta_pixel_id);

  return (
    <>
      <MetaPixelRuntime pixelId={metaPixelId} />
      <MetaPixel pixelId={metaPixelId} />
      {orderId ? <OrderSuccessMetaLead orderId={orderId} /> : null}
      <OrderSuccessClient
        orderId={orderId}
        completionToken={completionToken}
        actionToken={actionToken}
        productId={productId}
        productName={product?.name_ar ?? null}
        totalPrice={typeof totalPrice === "number" && Number.isFinite(totalPrice) ? totalPrice : null}
        currency="MRU"
      />
      <OrderSuccessContent />
    </>
  );
}
