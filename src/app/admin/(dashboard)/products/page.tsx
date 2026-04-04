import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { adminAr as a } from "@/locales/admin-ar";
import { formatPrice } from "@/lib/currency";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select("id, name, slug, price, discount_price, created_at")
    .order("created_at", { ascending: false });

  const rows = products ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{a.products.title}</h1>
        <Link
          href="/admin/products/new"
          className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)]"
        >
          {a.products.newProduct}
        </Link>
      </div>
      <div className="mt-8 overflow-x-auto rounded-2xl border border-[var(--accent-muted)]">
        <table className="min-w-full divide-y divide-[var(--accent-muted)] text-sm">
          <thead className="bg-[var(--card)] text-start text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">{a.products.name}</th>
              <th className="px-4 py-3">{a.products.slug}</th>
              <th className="px-4 py-3">{a.products.price}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--accent-muted)]">
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 font-mono text-xs" dir="ltr">
                  {p.slug}
                </td>
                <td className="px-4 py-3" dir="ltr">
                  {formatPrice(
                    p.discount_price != null
                      ? Number(p.discount_price)
                      : Number(p.price),
                  )}
                </td>
                <td className="px-4 py-3 text-end">
                  <Link
                    href={`/admin/products/${p.id}/edit`}
                    className="text-[var(--accent)] underline"
                  >
                    {a.products.edit}
                  </Link>
                  <span className="mx-2 text-[var(--muted)]">·</span>
                  <Link href={`/${p.slug}`} className="text-[var(--muted)] underline">
                    {a.products.view}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--muted)]">{a.products.noProducts}</p>
      ) : null}
    </div>
  );
}
