import Link from "next/link";
import {
  createPublicClient,
  isSupabaseConfigured,
} from "@/lib/supabase/public";

export const revalidate = 60;

export default async function HomePage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-bold tracking-tight">Catalog</h1>
        <p className="mt-4 text-sm text-[var(--muted)]">
          Set{" "}
          <code className="rounded bg-[var(--accent-muted)]/50 px-1">
            NEXT_PUBLIC_SUPABASE_URL
          </code>{" "}
          and{" "}
          <code className="rounded bg-[var(--accent-muted)]/50 px-1">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </code>{" "}
          to load products.
        </p>
      </div>
    );
  }

  const supabase = createPublicClient();
  const { data } = await supabase
    .from("products")
    .select("name, slug, discount_price, price")
    .order("created_at", { ascending: false });

  const products = data ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Catalog</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Single-product landing pages — pick a product to view its page.
      </p>
      <ul className="mt-10 space-y-3">
        {products.map((p) => (
          <li key={p.slug}>
            <Link
              href={`/${p.slug}`}
              className="flex items-center justify-between rounded-2xl border border-[var(--accent-muted)] bg-[var(--card)] px-5 py-4 transition hover:border-[var(--accent)]"
            >
              <span className="font-medium">{p.name}</span>
              <span className="text-sm text-[var(--muted)]">
                $
                {(
                  p.discount_price != null
                    ? Number(p.discount_price)
                    : Number(p.price)
                ).toFixed(2)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {products.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--muted)]">
          No products yet. Add one in the admin panel.
        </p>
      ) : null}
      <p className="mt-12 text-center text-xs text-[var(--muted)]">
        <Link href="/admin" className="underline">
          Admin
        </Link>
      </p>
    </div>
  );
}
