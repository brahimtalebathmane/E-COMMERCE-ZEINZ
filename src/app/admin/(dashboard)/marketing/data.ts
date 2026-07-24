import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

export type CampaignStatus = "draft" | "sending" | "completed" | "failed";
export type AudienceType = "all_confirmed" | "by_product" | "manual";

export type CampaignRow = {
  id: string;
  messageText: string;
  imageUrl: string | null;
  audienceType: AudienceType;
  productId: string | null;
  excludeShippedProductIds: string[];
  status: CampaignStatus;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
};

export type ProductOption = { id: string; nameAr: string };

export type MarketingData = {
  campaigns: CampaignRow[];
  products: ProductOption[];
};

export type LoadMarketingResult = { ok: true; data: MarketingData } | { ok: false; error: string };

/** Campaign list + product dropdown — both tables have proper RLS, cookie-scoped client is fine. */
export async function loadMarketingData(cookieClient: SupabaseClient): Promise<LoadMarketingResult> {
  const [campaignsRes, productsRes] = await Promise.all([
    cookieClient
      .from("marketing_campaigns")
      .select(
        "id, message_text, image_url, audience_type, product_id, exclude_shipped_product_ids, status, total_recipients, sent_count, failed_count, created_at",
      )
      .order("created_at", { ascending: false }),
    cookieClient.from("products").select("id, name_ar").is("deleted_at", null).order("name_ar"),
  ]);

  if (campaignsRes.error) return { ok: false, error: campaignsRes.error.message };
  if (productsRes.error) return { ok: false, error: productsRes.error.message };

  return {
    ok: true,
    data: {
      campaigns: (campaignsRes.data ?? []).map((c) => ({
        id: String(c.id),
        messageText: c.message_text,
        imageUrl: c.image_url,
        audienceType: c.audience_type as AudienceType,
        productId: c.product_id,
        excludeShippedProductIds: (c.exclude_shipped_product_ids ?? []) as string[],
        status: c.status as CampaignStatus,
        totalRecipients: c.total_recipients,
        sentCount: c.sent_count,
        failedCount: c.failed_count,
        createdAt: c.created_at,
      })),
      products: (productsRes.data ?? []).map((p) => ({ id: String(p.id), nameAr: p.name_ar ?? "" })),
    },
  };
}

export type RecipientRow = {
  phone: string;
  customerName: string | null;
};

/**
 * Phones that have a shipped order (current status='shipped', OR ever
 * reached 'shipped' per order_status_history — a shipped order later marked
 * internal_return still means the customer received the product, which is
 * exactly the pricing-conflict scenario this exists to avoid) for any of the
 * given products. Empty input returns an empty set (no exclusion).
 */
export async function shippedPhonesForProducts(productIds: string[]): Promise<Set<string>> {
  if (productIds.length === 0) return new Set();
  const service = createServiceClient();
  const { data, error } = await service.rpc("marketing_shipped_phones", { p_product_ids: productIds });
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row: { phone: string }) => row.phone));
}

function excludeByPhone(recipients: RecipientRow[], excluded: Set<string>): RecipientRow[] {
  if (excluded.size === 0) return recipients;
  return recipients.filter((r) => !excluded.has(r.phone));
}

/**
 * Audience for the two automatic modes, via the marketing_audience_confirmed
 * RPC (service-role client — order_status_history has RLS enabled with zero
 * policies, so it can only be read via service role). Applies the
 * already-shipped exclusion filter after the base audience is resolved.
 */
export async function resolveAudience(
  audienceType: "all_confirmed" | "by_product",
  productId?: string | null,
  excludeShippedProductIds: string[] = [],
): Promise<RecipientRow[]> {
  const service = createServiceClient();
  const { data, error } = await service.rpc("marketing_audience_confirmed", {
    p_product_id: audienceType === "by_product" ? productId ?? null : null,
  });
  if (error) throw new Error(error.message);
  const recipients = (data ?? []).map((row: { phone: string; customer_name: string | null }) => ({
    phone: row.phone,
    customerName: row.customer_name,
  }));
  const excluded = await shippedPhonesForProducts(excludeShippedProductIds);
  return excludeByPhone(recipients, excluded);
}

/** Manual mode: ALL past customers (not gated to confirmed), searchable by name or phone. */
export async function searchAllCustomers(
  searchTerm: string,
  excludeShippedProductIds: string[] = [],
): Promise<RecipientRow[]> {
  const service = createServiceClient();
  const term = searchTerm.trim();

  let query = service
    .from("orders")
    .select("phone, customer_name, created_at")
    .is("deleted_at", null)
    .not("phone", "is", null)
    .order("phone", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(500);

  if (term) {
    const escaped = term.replace(/[%_]/g, (m) => `\\${m}`);
    query = query.or(`customer_name.ilike.%${escaped}%,phone.ilike.%${escaped}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const seen = new Set<string>();
  const result: RecipientRow[] = [];
  for (const o of data ?? []) {
    const phone = String(o.phone);
    if (seen.has(phone)) continue;
    seen.add(phone);
    result.push({ phone, customerName: (o.customer_name as string | null) ?? null });
  }

  const excluded = await shippedPhonesForProducts(excludeShippedProductIds);
  return excludeByPhone(result, excluded);
}
