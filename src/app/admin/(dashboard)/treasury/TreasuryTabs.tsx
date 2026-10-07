"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminAr as a } from "@/locales/admin-ar";

const TABS = [
  { href: "/admin/treasury", label: a.treasury.nav.dashboard, exact: true },
  { href: "/admin/treasury/transactions", label: a.treasury.nav.transactions },
  { href: "/admin/treasury/settle", label: a.treasury.nav.settle },
  { href: "/admin/treasury/setup", label: a.treasury.nav.setup },
];

export function TreasuryTabs() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="mb-5 flex flex-wrap gap-2" aria-label={a.treasury.title}>
      {TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`min-h-[40px] rounded-xl border px-3 py-2 text-sm font-semibold transition ${
              active
                ? "border-[var(--accent)] bg-[var(--accent-muted)]/30 text-[var(--foreground)]"
                : "border-[var(--admin-border)] text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
