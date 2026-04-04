import { ProductForm } from "@/components/admin/ProductForm";
import { createClient } from "@/lib/supabase/server";
import { mapProductRow } from "@/lib/products";
import { adminAr as a } from "@/locales/admin-ar";
import { notFound } from "next/navigation";

type PageProps = { params: Promise<{ id: string }> };

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

  const product = mapProductRow(data as Record<string, unknown>);

  return (
    <div>
      <h1 className="text-2xl font-semibold">{a.editProduct.title}</h1>
      <div className="mt-8">
        <ProductForm mode="edit" initial={product} />
      </div>
    </div>
  );
}
