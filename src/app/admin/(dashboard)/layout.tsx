import Link from "next/link";
import { adminAr as a } from "@/locales/admin-ar";

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--background)]" dir="rtl" lang="ar">
      <header className="border-b border-[var(--accent-muted)] bg-[var(--card)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <Link href="/admin" className="font-semibold">
            {a.nav.title}
          </Link>
          <nav className="flex flex-wrap gap-4 text-sm">
            <Link
              href="/admin/products"
              className="text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              {a.nav.products}
            </Link>
            <Link
              href="/admin/orders"
              className="text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              {a.nav.orders}
            </Link>
            <Link
              href="/admin/payment-methods"
              className="text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              {a.nav.paymentMethods}
            </Link>
            <Link href="/" className="text-[var(--muted)] hover:text-[var(--foreground)]">
              {a.nav.storefront}
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 text-start">{children}</main>
    </div>
  );
}
