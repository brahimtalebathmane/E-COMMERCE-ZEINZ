import { formatPrice } from "@/lib/currency";
import { getPublicSiteUrl } from "@/lib/site-url";

/** Per-product WhatsApp for orders, else site-wide NEXT_PUBLIC_WHATSAPP_E164 (digits for wa.me). */
export function resolveOrderWhatsAppE164Digits(product: {
  whatsapp_e164: string | null;
}): string {
  const fromProduct = (product.whatsapp_e164 ?? "").replace(/\D/g, "");
  if (fromProduct) return fromProduct;
  return (process.env.NEXT_PUBLIC_WHATSAPP_E164 ?? "").replace(/\D/g, "");
}

export function buildCompletionWhatsAppUrl(
  orderId: string,
  completionToken: string,
  adminPhoneE164?: string | null,
  totalPrice?: number,
): string {
  const base = getPublicSiteUrl();
  const path = `${base}/complete-order/${orderId}?token=${encodeURIComponent(completionToken)}`;
  const amount =
    totalPrice !== undefined && Number.isFinite(totalPrice)
      ? formatPrice(totalPrice)
      : null;
  const text = amount
    ? `يرجى إكمال تفاصيل طلبك — المبلغ: ${amount} — ${path}`
    : `يرجى إكمال تفاصيل طلبك: ${path}`;
  const phone = (adminPhoneE164 ?? process.env.NEXT_PUBLIC_WHATSAPP_E164 ?? "")
    .replace(/\D/g, "");
  if (!phone) {
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
