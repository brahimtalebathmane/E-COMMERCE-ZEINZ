import Image from "next/image";
import Link from "next/link";
import { ProductForm } from "@/components/admin/ProductForm";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapProductRow } from "@/lib/products";
import { formatMoney, resolveDisplayCurrency } from "@/lib/currency";
import { codMarginPercent, sourcingTypeLabel } from "@/lib/product-pipeline";
import { adminAr as a } from "@/locales/admin-ar";
import { AdminPageHeader } from "@/components/admin/ui";
import { notFound } from "next/navigation";

type PageProps = { params: Promise<{ id: string }> };

export default async function LandingSetupPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data, error }, { data: countries }] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).maybeSingle(),
    // Non-owner staff have no SELECT policy on the base `countries` table
    // (only `countries_select_admin`, owner-only) — this view is readable
    // by any authenticated panel user and already filters is_active=true.
    supabase
      .from("countries_public")
      .select("id, name_ar, name_fr, iso_code")
      .order("name_ar"),
  ]);

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
  // This product's own market currency, not necessarily the admin's
  // currently-selected one — this page can be reached via a direct link
  // regardless of scope, same as the edit page. Looked up separately
  // (rather than reusing the `countries_public` list above) since that
  // list is filtered to active countries only and this product's country
  // could be inactive — so this one query needs the base table, via the
  // service role (a non-owner staff session has no base-table SELECT
  // policy at all; `currency` isn't sensitive and the page is already
  // admin-gated).
  const { data: productCountry } = await createServiceClient()
    .from("countries")
    .select("currency")
    .eq("id", product.country_id)
    .maybeSingle();
  const productCurrency = productCountry?.currency ?? "MRU";
  const displayCurrency = resolveDisplayCurrency(product.display_currency, productCurrency);

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
            {formatMoney(product.price, productCurrency)}
            {product.cost_price != null
              ? ` · ${a.landingSetup.cost}: ${formatMoney(product.cost_price, productCurrency)}`
              : null}
            {margin != null ? ` · ${a.pipeline.marginLabel}: ${Math.round(margin * 10) / 10}%` : null}
            {` · ${a.landingSetup.displayCurrency}: ${displayCurrency}`}
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

      <ProductForm mode="landing-setup" initial={product} countries={countries ?? []} />
    </div>
  );
}
