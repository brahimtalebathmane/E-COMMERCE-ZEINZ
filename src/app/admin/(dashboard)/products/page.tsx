import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

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
        <h1 className="text-2xl font-semibold">Products</h1>
        <Link
          href="/admin/products/new"
          className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
        >
          New product
        </Link>
      </div>
      <div className="mt-8 overflow-x-auto rounded-2xl border border-[var(--accent-muted)]">
        <table className="min-w-full divide-y divide-[var(--accent-muted)] text-sm">
          <thead className="bg-[var(--card)] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--accent-muted)]">
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{p.slug}</td>
                <td className="px-4 py-3">
                  $
                  {(
                    p.discount_price != null
                      ? Number(p.discount_price)
                      : Number(p.price)
                  ).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/products/${p.id}/edit`}
                    className="text-[var(--accent)] underline"
                  >
                    Edit
                  </Link>
                  <span className="mx-2 text-[var(--muted)]">·</span>
                  <Link href={`/${p.slug}`} className="text-[var(--muted)] underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--muted)]">No products yet.</p>
      ) : null}
    </div>
  );
}
