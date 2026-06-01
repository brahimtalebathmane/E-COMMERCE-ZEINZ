import { MetaPixel } from "@/components/MetaPixel";
import { MetaPixelRuntime } from "@/components/MetaPixelRuntime";
import { resolveServerMetaPixelId } from "@/lib/meta-pixel-id";
import { getProductById } from "@/lib/products";
import { OrderSuccessClient } from "./OrderSuccessClient";
import { OrderSuccessContinueLink } from "./OrderSuccessContinueLink";

type Props = {
  searchParams?: Promise<{
    order_id?: string;
    product_id?: string;
    total_price?: string;
    completion_token?: string;
    action_token?: string;
  }>;
};

export default async function OrderSuccessPage({ searchParams }: Props) {
  const sp = searchParams ? await searchParams : undefined;
  const orderId = sp?.order_id?.trim() || null;
  const productId = sp?.product_id?.trim() || null;
  const completionToken = sp?.completion_token?.trim() || null;
  const actionToken = sp?.action_token?.trim() || null;
  const totalPriceRaw = sp?.total_price?.trim() || "";
  const totalPrice = totalPriceRaw ? Number(totalPriceRaw) : null;

  const product = productId ? await getProductById(productId) : null;

  const metaPixelId = resolveServerMetaPixelId(product?.meta_pixel_id);

  return (
    <div
      className="mx-auto flex min-h-[70dvh] max-w-2xl flex-col items-center justify-center px-4 py-12 text-center"
      dir="rtl"
      lang="ar"
    >
      <MetaPixelRuntime pixelId={metaPixelId} />
      <MetaPixel pixelId={metaPixelId} />
      <OrderSuccessClient
        orderId={orderId}
        completionToken={completionToken}
        actionToken={actionToken}
        productId={productId}
        productName={product?.name_ar ?? null}
        totalPrice={typeof totalPrice === "number" && Number.isFinite(totalPrice) ? totalPrice : null}
        currency="MRU"
      />
      <div className="w-full rounded-2xl border border-[var(--accent-muted)] bg-[var(--card)] p-6 shadow-sm sm:p-10">
        <p className="text-lg font-semibold text-[var(--foreground)] sm:text-xl">
          تم إرسال طلبكم بنجاح، سيتواصل معكم فريقنا الآن لإتمام الطلب
        </p>
        <OrderSuccessContinueLink />
      </div>
    </div>
  );
}

