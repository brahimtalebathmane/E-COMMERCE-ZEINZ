import { ProductForm } from "@/components/admin/ProductForm";
import { createClient } from "@/lib/supabase/server";
import type { ProductRow } from "@/types";
import { notFound } from "next/navigation";

type PageProps = { params: Promise<{ id: string }> };

function mapRow(row: Record<string, unknown>): ProductRow {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? "",
    slug: row.slug as string,
    old_slugs: (row.old_slugs as string[]) ?? [],
    price: Number(row.price),
    discount_price:
      row.discount_price === null || row.discount_price === undefined
        ? null
        : Number(row.discount_price),
    media_type: row.media_type as "image" | "video",
    media_url: row.media_url as string,
    features: (row.features as string[]) ?? [],
    gallery: (row.gallery as string[]) ?? [],
    testimonials: (row.testimonials as ProductRow["testimonials"]) ?? [],
    faqs: (row.faqs as ProductRow["faqs"]) ?? [],
    meta_pixel_id: (row.meta_pixel_id as string | null) ?? null,
    form_title: (row.form_title as string) ?? "",
    form_fields: Array.isArray(row.form_fields)
      ? (row.form_fields as ProductRow["form_fields"])
      : [],
    created_at: row.created_at as string,
  };
}

export default async function EditProductPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  const product = mapRow(data as Record<string, unknown>);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Edit product</h1>
      <div className="mt-8">
        <ProductForm mode="edit" initial={product} />
      </div>
    </div>
  );
}
