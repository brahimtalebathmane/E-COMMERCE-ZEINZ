import Link from "next/link";
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{a.editProduct.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {product.test_status === "under_research" ? (
            <Link
              href={`/admin/products/${id}/landing-setup`}
              className="rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--accent-muted)]/20"
            >
              {a.pipeline.setupLanding}
            </Link>
          ) : null}
        </div>
      </div>
      <div className="mt-8">
        <ProductForm mode="edit" initial={product} />
      </div>
    </div>
  );
}
