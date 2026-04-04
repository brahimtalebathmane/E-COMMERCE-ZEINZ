import { getPublicSiteUrl } from "@/lib/site-url";

export function buildCompletionWhatsAppUrl(
  orderId: string,
  completionToken: string,
  adminPhoneE164?: string | null,
): string {
  const base = getPublicSiteUrl();
  const path = `${base}/complete-order/${orderId}?token=${encodeURIComponent(completionToken)}`;
  const text = `يرجى إكمال تفاصيل طلبك: ${path}`;
  const phone = (adminPhoneE164 ?? process.env.NEXT_PUBLIC_WHATSAPP_E164 ?? "")
    .replace(/\D/g, "");
  if (!phone) {
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
