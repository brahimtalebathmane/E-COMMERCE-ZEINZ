import Image from "next/image";
import Link from "next/link";
import { ProductForm } from "@/components/admin/ProductForm";
import { createClient } from "@/lib/supabase/server";
import { mapProductRow } from "@/lib/products";
import { formatPrice } from "@/lib/currency";
import { codMarginPercent, sourcingTypeLabel } from "@/lib/product-pipeline";
import { adminAr as a } from "@/locales/admin-ar";
import { AdminPageHeader } from "@/components/admin/ui";
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
    <div className="space-y-6">
      <AdminPageHeader
        title={a.landingSetup.title}
        subtitle={a.landingSetup.subtitle}
        actions={
          <Link
            href="/admin/products"
            className="admin-btn-ghost !min-h-[44px] text-sm"
          >
            ← {a.landingSetup.backToPipeline}
          </Link>
        }
      />

      <div className="admin-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        {product.media_url.trim() && product.media_type === "image" ? (
          <div className="relative mx-auto h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-[var(--admin-border)] sm:mx-0 sm:h-16 sm:w-16">
            <Image
              src={product.media_url}
              alt=""
              fill
              className="object-cover"
              sizes="80px"
              unoptimized
            />
          </div>
        ) : null}
        <div className="min-w-0 flex-1 text-sm">
          <p className="break-words font-semibold text-[var(--foreground)]">{product.name_ar}</p>
          <p className="mt-1 break-words text-[var(--muted)]" dir="ltr">
            {formatPrice(product.price)}
            {product.cost_price != null
              ? ` · ${a.landingSetup.cost}: ${formatPrice(product.cost_price)}`
              : null}
            {margin != null ? ` · ${a.pipeline.marginLabel}: ${Math.round(margin * 10) / 10}%` : null}
          </p>
          <p className="mt-1 break-words text-xs text-[var(--muted)]">
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

      <ProductForm mode="landing-setup" initial={product} />
    </div>
  );
}
