import { ProductForm } from "@/components/admin/ProductForm";
import { AdminLinkButton, AdminPageHeader } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/server";
import { mapProductRow } from "@/lib/products";
import { adminAr as a } from "@/locales/admin-ar";
import { notFound } from "next/navigation";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditProductPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data, error }, { data: countries }] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("countries")
      .select("id, name_ar, name_fr, iso_code")
      .eq("is_active", true)
      .order("name_ar"),
  ]);

  if (error || !data) {
    notFound();
  }

  const product = mapProductRow(data as Record<string, unknown>);

  return (
    <div>
      <AdminPageHeader
        title={a.editProduct.title}
        actions={
          product.test_status === "under_research" ? (
            <AdminLinkButton href={`/admin/products/${id}/landing-setup`} variant="ghost">
              {a.pipeline.setupLanding}
            </AdminLinkButton>
          ) : null
        }
      />
      <ProductForm mode="edit" initial={product} countries={countries ?? []} />
    </div>
  );
}
