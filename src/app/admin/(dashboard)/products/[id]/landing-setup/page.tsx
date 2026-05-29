import Image from "next/image";
import Link from "next/link";
import { ProductForm } from "@/components/admin/ProductForm";
import { createClient } from "@/lib/supabase/server";
import { mapProductRow } from "@/lib/products";
import { formatPrice } from "@/lib/currency";
import { codMarginPercent, sourcingTypeLabel } from "@/lib/product-pipeline";
import { adminAr as a } from "@/locales/admin-ar";
import { notFound } from "next/navigation";

type PageProps = { params: Promise<{ id: string }> };

export default async function LandingSetupPage({ params }: PageProps) {
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

  if (product.test_status === "failed") {
    notFound();
  }

  const margin = codMarginPercent(
    product.price,
    product.discount_price,
    product.cost_price,
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/products"
          className="text-sm text-[var(--muted)] underline"
        >
          ← {a.landingSetup.backToPipeline}
        </Link>
      </div>
      <h1 className="mt-4 text-2xl font-semibold">{a.landingSetup.title}</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{a.landingSetup.subtitle}</p>

      <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--accent-muted)] bg-[var(--card)] p-4">
        {product.media_url.trim() && product.media_type === "image" ? (
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[var(--accent-muted)]">
            <Image
              src={product.media_url}
              alt=""
              fill
              className="object-cover"
              sizes="64px"
              unoptimized
            />
          </div>
        ) : null}
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">{product.name_ar}</p>
          <p className="mt-1 text-[var(--muted)]" dir="ltr">
            {formatPrice(product.price)}
            {product.cost_price != null
              ? ` · ${a.landingSetup.cost}: ${formatPrice(product.cost_price)}`
              : null}
            {margin != null ? ` · ${a.pipeline.marginLabel}: ${Math.round(margin * 10) / 10}%` : null}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {sourcingTypeLabel(product.sourcing_type)}
            {product.sourcing_link.trim() ? (
              <>
                {" · "}
                <a
                  href={product.sourcing_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent)] underline"
                  dir="ltr"
                >
                  {a.pipeline.sourcingLink}
                </a>
              </>
            ) : null}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <ProductForm mode="landing-setup" initial={product} />
      </div>
    </div>
  );
}
