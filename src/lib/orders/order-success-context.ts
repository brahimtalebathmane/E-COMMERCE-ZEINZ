import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { resolveMetaProductDisplayName } from "@/lib/meta-product-custom-data";
import { resolveServerMetaPixelId } from "@/lib/meta-pixel-id";
import { createClient } from "@/lib/supabase/server";

export type OrderSuccessContext = {
  metaPixelId: string | null;
  productId: string | null;
  productName: string | null;
  totalPrice: number | null;
  currency: string;
};

/** Loads order + product context when the HttpOnly success session matches. */
export async function loadOrderSuccessContext(
  orderId: string | null,
  sessionOrderId: string | null,
): Promise<OrderSuccessContext | null> {
  const id = orderId?.trim();
  const sessionId = sessionOrderId?.trim();
  if (!id || !sessionId || id !== sessionId) return null;

  const supabase = createServiceClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("product_id, total_price, currency, meta_pixel_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !order) return null;

  let productName: string | null = null;
  if (order.product_id) {
    const { data: product } = await supabase
      .from("products")
      .select("name_ar, name_fr, default_language")
      .eq("id", order.product_id as string)
      .maybeSingle();
    if (product) {
      productName = resolveMetaProductDisplayName(product);
    }
  }

  const total = Number(order.total_price);
  return {
    metaPixelId: resolveServerMetaPixelId(),
    productId: (order.product_id as string | null) ?? null,
    productName,
    totalPrice: Number.isFinite(total) ? total : null,
    currency: (order.currency as string) ?? "MRU",
  };
}

/** Display name from product_id when the HttpOnly success cookie is unavailable. */
export async function resolveProductNameFromId(
  productId: string | null,
): Promise<string | null> {
  const id = productId?.trim();
  if (!id) return null;

  const supabase = await createClient();
  const { data: product, error } = await supabase
    .from("products")
    .select("name_ar, name_fr, default_language")
    .eq("id", id)
    .maybeSingle();

  if (error || !product) return null;
  return resolveMetaProductDisplayName(product);
}
