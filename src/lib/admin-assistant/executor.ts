import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { BRAND_COLOR } from "@/lib/site-branding";
import { allocateUniqueSlug, resolveProductSlugFields } from "@/lib/product-slug";
import { normalizeMetaPixelId } from "@/lib/meta-pixel-id";
import { updateOrderStatusWithEffects } from "@/lib/orders/update-status";
import type { OrderStatus, ProductSourcingType, ProductTestingStatus } from "@/types";

const TEST_STATUSES: ProductTestingStatus[] = [
  "under_research",
  "ready_for_test",
  "testing",
  "winner",
  "failed",
];

const ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "shipped",
  "cancelled",
  "requires_human_intervention",
];

export type AdminToolContext = {
  supabase: SupabaseClient;
  requestHeaders?: Headers;
};

type ToolResult = Record<string, unknown>;

function ok(data: ToolResult): ToolResult {
  return { ok: true, ...data };
}

function fail(error: string): ToolResult {
  return { ok: false, error };
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

function asTrimmed(value: unknown): string | undefined {
  const s = asString(value);
  return s == null ? undefined : s.trim();
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function clampLimit(value: unknown, fallback: number, max: number): number {
  const n = asNumber(value);
  if (n == null) return fallback;
  return Math.min(max, Math.max(1, Math.round(n)));
}

const PRODUCT_SUMMARY_COLUMNS =
  "id, name_ar, slug, price, discount_price, test_status, created_at";

const PRODUCT_DETAIL_COLUMNS =
  "id, name_ar, name_fr, slug, price, discount_price, cost_price, currency, description_ar, description_fr, hero_subtitle_ar, header_bar_text_ar, cta_text_ar, meta_pixel_id, whatsapp_message_template, test_status, sourcing_type, sourcing_link, media_type, media_url, created_at";

const ORDER_SUMMARY_COLUMNS =
  "id, customer_name, phone, total_price, currency, status, created_at, product_id";

async function listProducts(ctx: AdminToolContext, args: ToolResult): Promise<ToolResult> {
  const limit = clampLimit(args.limit, 20, 50);
  let query = ctx.supabase
    .from("products")
    .select(PRODUCT_SUMMARY_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  const testStatus = asTrimmed(args.test_status);
  if (testStatus && (TEST_STATUSES as string[]).includes(testStatus)) {
    query = query.eq("test_status", testStatus);
  }

  const search = asTrimmed(args.query);
  if (search) {
    const escaped = search.replace(/[%,]/g, " ");
    query = query.or(`name_ar.ilike.%${escaped}%,slug.ilike.%${escaped}%`);
  }

  const { data, error } = await query;
  if (error) return fail(error.message);
  return ok({ count: data?.length ?? 0, products: data ?? [] });
}

async function getProduct(ctx: AdminToolContext, args: ToolResult): Promise<ToolResult> {
  const productId = asTrimmed(args.product_id);
  const slug = asTrimmed(args.slug);
  if (!productId && !slug) return fail("Provide product_id or slug.");

  let query = ctx.supabase.from("products").select(PRODUCT_DETAIL_COLUMNS);
  query = productId ? query.eq("id", productId) : query.eq("slug", slug as string);

  const { data, error } = await query.maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail("Product not found.");
  return ok({ product: data });
}

async function createProduct(ctx: AdminToolContext, args: ToolResult): Promise<ToolResult> {
  const nameAr = asTrimmed(args.name_ar);
  const price = asNumber(args.price);
  const costPrice = asNumber(args.cost_price);
  const sourcingType = asTrimmed(args.sourcing_type) as ProductSourcingType | undefined;
  const sourcingLink = asTrimmed(args.sourcing_link);
  const mediaUrl = asTrimmed(args.media_url);
  const mediaType = asTrimmed(args.media_type) === "video" ? "video" : "image";

  if (!nameAr) return fail("name_ar is required.");
  if (price == null || price <= 0) return fail("price must be greater than zero.");
  if (costPrice == null || costPrice < 0) return fail("cost_price must be zero or greater.");
  if (sourcingType !== "local" && sourcingType !== "import") {
    return fail("sourcing_type must be 'local' or 'import'.");
  }
  if (!sourcingLink) return fail("sourcing_link is required.");
  if (!mediaUrl) return fail("media_url is required.");

  let slug: string;
  try {
    slug = await allocateUniqueSlug(ctx.supabase, nameAr);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not allocate slug.");
  }

  const insert = {
    default_language: "ar" as const,
    brand_color: BRAND_COLOR,
    logo_url: "",
    name_ar: nameAr,
    name_fr: "",
    hero_subtitle_ar: "",
    hero_subtitle_fr: "",
    header_bar_text_ar: "",
    header_bar_text_fr: "",
    header_bar_max_lines: 1,
    header_bar_font_size_px: null,
    header_offer_text_ar: "",
    header_offer_text_fr: "",
    header_discount_text_ar: "",
    header_discount_text_fr: "",
    header_promo_text_ar: "",
    header_promo_text_fr: "",
    header_announcement_text_ar: "",
    header_announcement_text_fr: "",
    header_cta_text_ar: "",
    header_cta_text_fr: "",
    description_ar: "",
    description_fr: "",
    cta_text_ar: "",
    cta_text_fr: "",
    features_title_ar: "",
    features_title_fr: "",
    testimonials_title_ar: "",
    testimonials_title_fr: "",
    media_caption_ar: "",
    media_caption_fr: "",
    faq_title_ar: "",
    faq_title_fr: "",
    stats_section_title_ar: "",
    stats_section_title_fr: "",
    testimonials_badge_ar: "",
    testimonials_badge_fr: "",
    footer_note_ar: "",
    footer_note_fr: "",
    cta_banner_background_color: "",
    cta_banner_background_image_url: "",
    cta_banner_image_overlay: 0.45,
    contact_title_ar: "",
    contact_title_fr: "",
    whatsapp_message_template: null,
    slug,
    old_slugs: [] as string[],
    price,
    discount_price: null,
    media_type: mediaType,
    media_url: mediaUrl,
    secondary_media_type: "image" as const,
    secondary_media_url: "",
    tertiary_media_type: "image" as const,
    tertiary_media_url: "",
    features_ar: [] as string[],
    features_fr: [] as string[],
    gallery: [] as string[],
    testimonials_ar: [],
    testimonials_fr: [],
    faqs_ar: [],
    faqs_fr: [],
    stats_ar: [] as string[],
    stats_fr: [] as string[],
    contact_lines_ar: [] as string[],
    contact_lines_fr: [] as string[],
    meta_pixel_id: null,
    sticky_footer_offer_ends_at: null,
    sticky_footer_timer_label_ar: "",
    sticky_footer_timer_label_fr: "",
    sticky_footer_savings_badge_ar: "",
    sticky_footer_savings_badge_fr: "",
    sticky_footer_bar_bg_color: "",
    sticky_footer_badge_bg_color: "",
    sticky_footer_timer_box_bg_color: "",
    sticky_footer_timer_digit_color: "",
    sticky_footer_cta_bg_color: "",
    sticky_footer_cta_text_color: "",
    sticky_footer_show_timer: true,
    test_status: "under_research" as const,
    sourcing_type: sourcingType,
    sourcing_link: sourcingLink,
    cost_price: costPrice,
  };

  const { data, error } = await ctx.supabase
    .from("products")
    .insert(insert)
    .select("id, name_ar, slug, price, test_status")
    .maybeSingle();

  if (error) return fail(error.message);

  revalidatePath("/admin/products");
  return ok({ created: true, product: data });
}

async function updateProduct(ctx: AdminToolContext, args: ToolResult): Promise<ToolResult> {
  const productId = asTrimmed(args.product_id);
  if (!productId) return fail("product_id is required.");

  const { data: existing, error: fetchErr } = await ctx.supabase
    .from("products")
    .select("id, slug, old_slugs")
    .eq("id", productId)
    .maybeSingle();

  if (fetchErr) return fail(fetchErr.message);
  if (!existing) return fail("Product not found.");

  const updates: Record<string, unknown> = {};
  const changed: string[] = [];

  function setText(key: string) {
    if (key in args) {
      updates[key] = asString(args[key]) ?? "";
      changed.push(key);
    }
  }

  setText("name_ar");
  setText("name_fr");
  setText("description_ar");
  setText("description_fr");
  setText("hero_subtitle_ar");
  setText("header_bar_text_ar");
  setText("cta_text_ar");
  setText("sourcing_link");

  if ("name_ar" in args && !asTrimmed(args.name_ar)) {
    return fail("name_ar cannot be empty.");
  }

  if ("price" in args) {
    const price = asNumber(args.price);
    if (price == null || price <= 0) return fail("price must be greater than zero.");
    updates.price = price;
    changed.push("price");
  }

  if ("discount_price" in args) {
    const discount = asNumber(args.discount_price);
    if (discount == null) return fail("discount_price must be a number (0 to clear).");
    if (discount === 0) {
      updates.discount_price = null;
    } else if (discount < 0) {
      return fail("discount_price must be a positive number, or 0 to clear.");
    } else {
      updates.discount_price = discount;
    }
    changed.push("discount_price");
  }

  if ("cost_price" in args) {
    const cost = asNumber(args.cost_price);
    if (cost == null || cost < 0) return fail("cost_price must be zero or greater.");
    updates.cost_price = cost;
    changed.push("cost_price");
  }

  if ("meta_pixel_id" in args) {
    const raw = asTrimmed(args.meta_pixel_id);
    if (raw) {
      const normalized = normalizeMetaPixelId(raw);
      if (!normalized) return fail("meta_pixel_id must be a numeric Meta Pixel ID (10–20 digits).");
      updates.meta_pixel_id = normalized;
    } else {
      updates.meta_pixel_id = null;
    }
    changed.push("meta_pixel_id");
  }

  if ("whatsapp_message_template" in args) {
    const tmpl = asString(args.whatsapp_message_template)?.trim();
    updates.whatsapp_message_template = tmpl ? tmpl : null;
    changed.push("whatsapp_message_template");
  }

  if ("test_status" in args) {
    const status = asTrimmed(args.test_status);
    if (!status || !(TEST_STATUSES as string[]).includes(status)) {
      return fail("test_status is invalid.");
    }
    updates.test_status = status;
    changed.push("test_status");
  }

  if ("sourcing_type" in args) {
    const type = asTrimmed(args.sourcing_type);
    if (type !== "local" && type !== "import") {
      return fail("sourcing_type must be 'local' or 'import'.");
    }
    updates.sourcing_type = type;
    changed.push("sourcing_type");
  }

  const previousSlug = String(existing.slug ?? "");
  let newSlug = previousSlug;
  if ("slug" in args || "name_ar" in args) {
    try {
      const resolved = await resolveProductSlugFields(
        ctx.supabase,
        asString(args.slug) ?? "",
        asString(args.name_ar) ?? String(existing.slug ?? ""),
        {
          id: productId,
          slug: previousSlug,
          old_slugs: (existing.old_slugs as string[]) ?? [],
        },
      );
      if (resolved.slug !== previousSlug) {
        updates.slug = resolved.slug;
        updates.old_slugs = resolved.old_slugs;
        newSlug = resolved.slug;
        changed.push("slug");
      }
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Invalid slug.");
    }
  }

  if (Object.keys(updates).length === 0) {
    return fail("No supported fields were provided to update.");
  }

  const { data: updated, error: updateErr } = await ctx.supabase
    .from("products")
    .update(updates)
    .eq("id", productId)
    .select("id, name_ar, slug, price, discount_price, test_status")
    .maybeSingle();

  if (updateErr) return fail(updateErr.message);

  revalidatePath("/");
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}/edit`);
  if (previousSlug) revalidatePath(`/${previousSlug}`);
  if (newSlug && newSlug !== previousSlug) revalidatePath(`/${newSlug}`);

  return ok({ updated: true, changed_fields: changed, product: updated });
}

async function updateProductTestStatus(
  ctx: AdminToolContext,
  args: ToolResult,
): Promise<ToolResult> {
  const productId = asTrimmed(args.product_id);
  const status = asTrimmed(args.test_status);
  if (!productId) return fail("product_id is required.");
  if (!status || !(TEST_STATUSES as string[]).includes(status)) {
    return fail("test_status is invalid.");
  }

  const { data: existing, error: fetchErr } = await ctx.supabase
    .from("products")
    .select("id, slug, test_status")
    .eq("id", productId)
    .maybeSingle();

  if (fetchErr) return fail(fetchErr.message);
  if (!existing) return fail("Product not found.");

  const { error: updateErr } = await ctx.supabase
    .from("products")
    .update({ test_status: status })
    .eq("id", productId);

  if (updateErr) return fail(updateErr.message);

  revalidatePath("/");
  revalidatePath("/admin/products");
  if (existing.slug) revalidatePath(`/${existing.slug}`);

  return ok({
    updated: true,
    product_id: productId,
    from: existing.test_status,
    to: status,
  });
}

async function attachProductNames(
  ctx: AdminToolContext,
  rows: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  const ids = [...new Set(rows.map((r) => r.product_id).filter(Boolean))] as string[];
  if (ids.length === 0) return rows;
  const { data: products } = await ctx.supabase
    .from("products")
    .select("id, name_ar")
    .in("id", ids);
  const nameById = new Map(
    (products ?? []).map((p) => [p.id as string, p.name_ar as string]),
  );
  return rows.map((r) => ({
    ...r,
    product_name: nameById.get(r.product_id as string) ?? null,
  }));
}

async function listOrders(ctx: AdminToolContext, args: ToolResult): Promise<ToolResult> {
  const limit = clampLimit(args.limit, 20, 50);
  let query = ctx.supabase
    .from("orders")
    .select(ORDER_SUMMARY_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  const status = asTrimmed(args.status);
  if (status && (ORDER_STATUSES as string[]).includes(status)) {
    query = query.eq("status", status);
  }

  const phone = asTrimmed(args.phone);
  if (phone) {
    const escaped = phone.replace(/[%,]/g, " ");
    query = query.ilike("phone", `%${escaped}%`);
  }

  const { data, error } = await query;
  if (error) return fail(error.message);

  const withNames = await attachProductNames(ctx, data ?? []);
  return ok({ count: withNames.length, orders: withNames });
}

async function getOrder(ctx: AdminToolContext, args: ToolResult): Promise<ToolResult> {
  const orderId = asTrimmed(args.order_id);
  if (!orderId) return fail("order_id is required.");

  const { data, error } = await ctx.supabase
    .from("orders")
    .select(
      "id, customer_name, phone, payment_method, payment_number, transaction_reference, total_price, currency, status, form_data, created_at, product_id",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) return fail(error.message);
  if (!data) return fail("Order not found.");

  const [withName] = await attachProductNames(ctx, [data as Record<string, unknown>]);
  return ok({ order: withName });
}

async function updateOrderStatus(ctx: AdminToolContext, args: ToolResult): Promise<ToolResult> {
  const orderId = asTrimmed(args.order_id);
  const status = asTrimmed(args.status);
  if (!orderId) return fail("order_id is required.");
  if (!status || !(ORDER_STATUSES as string[]).includes(status)) {
    return fail("status is invalid.");
  }

  const result = await updateOrderStatusWithEffects(
    ctx.supabase,
    orderId,
    status as OrderStatus,
    { requestHeaders: ctx.requestHeaders },
  );

  if (!result.ok) {
    return fail(result.error);
  }

  revalidatePath("/admin/orders");

  return ok({
    updated: !result.unchanged,
    unchanged: result.unchanged,
    order_id: result.orderId,
    from: result.fromStatus,
    to: result.toStatus,
    meta_purchase: result.metaPurchase ?? null,
    meta_cancel: result.metaCancel ?? null,
  });
}

type ToolHandler = (ctx: AdminToolContext, args: ToolResult) => Promise<ToolResult>;

const HANDLERS: Record<string, ToolHandler> = {
  list_products: listProducts,
  get_product: getProduct,
  create_product: createProduct,
  update_product: updateProduct,
  update_product_test_status: updateProductTestStatus,
  list_orders: listOrders,
  get_order: getOrder,
  update_order_status: updateOrderStatus,
};

export async function executeAdminTool(
  ctx: AdminToolContext,
  name: string,
  rawArgs: string,
): Promise<string> {
  const handler = HANDLERS[name];
  if (!handler) {
    return JSON.stringify(fail(`Unknown tool: ${name}`));
  }

  let args: ToolResult;
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as ToolResult) : {};
  } catch {
    return JSON.stringify(fail("Invalid tool arguments JSON."));
  }

  try {
    const result = await handler(ctx, args);
    return JSON.stringify(result);
  } catch (e) {
    return JSON.stringify(fail(e instanceof Error ? e.message : String(e)));
  }
}
