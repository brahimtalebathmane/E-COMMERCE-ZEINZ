import Link from "next/link";

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--accent-muted)] bg-[var(--card)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <Link href="/admin" className="font-semibold">
            Admin
          </Link>
          <nav className="flex flex-wrap gap-4 text-sm">
            <Link
              href="/admin/products"
              className="text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Products
            </Link>
            <Link
              href="/admin/orders"
              className="text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Orders
            </Link>
            <Link
              href="/admin/payment-methods"
              className="text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Payment methods
            </Link>
            <Link href="/" className="text-[var(--muted)] hover:text-[var(--foreground)]">
              Storefront
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
