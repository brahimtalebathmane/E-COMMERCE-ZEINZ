/** Single line item in Meta `contents` (Pixel + CAPI). */
export type MetaProductContentItem = {
  id: string;
  quantity: number;
};

/** Product catalog fields shared by browser Pixel and server CAPI. */
export type MetaProductCustomData = {
  content_type: "product";
  content_ids: string[];
  content_name: string;
  contents: MetaProductContentItem[];
};

/** Resolve storefront display name (FR when default + available, else AR). */
export function resolveMetaProductDisplayName(input: {
  name_ar?: string | null;
  name_fr?: string | null;
  default_language?: "ar" | "fr" | null;
}): string {
  const ar = input.name_ar?.trim() ?? "";
  const fr = input.name_fr?.trim() ?? "";
  if (input.default_language === "fr" && fr) return fr;
  return ar || fr || "Product";
}

/**
 * Single source of truth for Meta product content fields (Pixel + CAPI).
 * `content_ids[0]` is always the Supabase `products.id` UUID string.
 */
export function resolveMetaContentData(input: {
  productId: string;
  productName: string;
  quantity?: number;
}): MetaProductCustomData | undefined {
  const id = input.productId.trim();
  if (!id) return undefined;
  const name = input.productName.trim() || "Product";
  const quantity =
    typeof input.quantity === "number" && Number.isFinite(input.quantity) && input.quantity > 0
      ? Math.floor(input.quantity)
      : 1;
  return {
    content_type: "product",
    content_ids: [id],
    content_name: name,
    contents: [{ id, quantity }],
  };
}

/** Build Meta product catalog keys for `custom_data` / Pixel event payloads. */
export function buildMetaProductCustomData(input: {
  productId: string;
  productName: string;
  quantity?: number;
}): MetaProductCustomData | undefined {
  return resolveMetaContentData(input);
}

/** Merge monetary fields with product catalog metadata for Lead / Purchase events. */
export function buildMetaOrderValueCustomData(input: {
  value: number;
  currency: string;
  productId: string;
  productName: string;
  quantity?: number;
}): MetaProductCustomData & { value: number; currency: string } {
  const product = resolveMetaContentData(input);
  if (!product) {
    return {
      value: input.value,
      currency: input.currency,
      content_type: "product",
      content_ids: [],
      content_name: input.productName.trim() || "Product",
      contents: [],
    };
  }
  return {
    value: input.value,
    currency: input.currency,
    ...product,
  };
}
