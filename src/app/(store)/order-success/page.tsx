import { MetaPixel } from "@/components/MetaPixel";
import { MetaPixelRuntime } from "@/components/MetaPixelRuntime";
import { resolveServerMetaPixelId } from "@/lib/meta-pixel-id";
import { getProductById } from "@/lib/products";
import { OrderSuccessClient } from "./OrderSuccessClient";
import { OrderSuccessMetaLead } from "./OrderSuccessMetaLead";
import { OrderSuccessContinueLink } from "./OrderSuccessContinueLink";

type Props = {
  searchParams?: Promise<{
    order_id?: string;
    product_id?: string;
    total_price?: string;
    completion_token?: string;
    action_token?: string;
    meta_event_id?: string;
  }>;
};

export default async function OrderSuccessPage({ searchParams }: Props) {
  const sp = searchParams ? await searchParams : undefined;
  const orderId = sp?.order_id?.trim() || null;
  const productId = sp?.product_id?.trim() || null;
  const completionToken = sp?.completion_token?.trim() || null;
  const actionToken = sp?.action_token?.trim() || null;
  const metaEventId = sp?.meta_event_id?.trim() || null;
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
      <OrderSuccessMetaLead metaEventId={metaEventId} metaPixelId={metaPixelId} />
      <OrderSuccessClient
        orderId={orderId}
        completionToken={completionToken}
        actionToken={actionToken}
        productId={productId}
        productName={product?.name_ar ?? null}
        totalPrice={typeof totalPrice === "number" && Number.isFinite(totalPrice) ? totalPrice : null}
        currency="MRU"
      />
      <div className="store-fade-up w-full overflow-hidden rounded-3xl border border-[var(--accent-muted)] bg-[var(--card)] p-6 shadow-[var(--shadow-md)] sm:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-soft)] sm:h-20 sm:w-20">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-foreground)] shadow-[var(--shadow-accent)] sm:h-14 sm:w-14">
            <svg viewBox="0 0 24 24" className="h-7 w-7 sm:h-8 sm:w-8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 13l4 4L19 7" />
            </svg>
          </span>
        </div>
        <h1 className="mt-5 text-xl font-extrabold leading-snug text-[var(--foreground)] sm:text-2xl">
          تم استلام طلبكم بنجاح
        </h1>
        <p className="mt-2 text-base font-medium leading-relaxed text-[var(--muted)] sm:text-lg">
          سيتواصل معكم فريقنا الآن لتأكيد طلبكم وإتمامه
        </p>
        <OrderSuccessContinueLink />
      </div>
    </div>
  );
}

