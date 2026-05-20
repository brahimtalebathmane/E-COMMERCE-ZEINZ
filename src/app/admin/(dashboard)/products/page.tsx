import { createClient } from "@/lib/supabase/server";
import { ProductsAdminView } from "./ProductsAdminView";
import type { AdminProductPipelineRow } from "./types";
import type { ProductSourcingType, ProductTestingStatus } from "@/types";

export const dynamic = "force-dynamic";

function mapPipelineRow(row: Record<string, unknown>): AdminProductPipelineRow {
  const mediaType = row.media_type === "video" ? "video" : "image";
  const st = row.test_status;
  const test_status: ProductTestingStatus =
    st === "ready_for_test" ||
    st === "testing" ||
    st === "winner" ||
    st === "failed"
      ? st
      : "under_research";
  const sourcingRaw = row.sourcing_type;
  const sourcing_type: ProductSourcingType | null =
    sourcingRaw === "local" || sourcingRaw === "import" ? sourcingRaw : null;

  return {
    id: String(row.id),
    name_ar: String(row.name_ar ?? ""),
    slug: String(row.slug ?? ""),
    price: Number(row.price ?? 0),
    discount_price:
      row.discount_price == null ? null : Number(row.discount_price),
    cost_price: row.cost_price == null ? null : Number(row.cost_price),
    media_url: String(row.media_url ?? ""),
    media_type: mediaType,
    sourcing_type,
    sourcing_link: String(row.sourcing_link ?? ""),
    test_status,
  };
}

export default async function AdminProductsPage() {
  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select(
      "id, name_ar, slug, price, discount_price, cost_price, media_url, media_type, sourcing_type, sourcing_link, test_status, created_at",
    )
    .order("created_at", { ascending: false });

  const rows: AdminProductPipelineRow[] = (products ?? []).map((p) =>
    mapPipelineRow(p as Record<string, unknown>),
  );

  return <ProductsAdminView products={rows} />;
}
