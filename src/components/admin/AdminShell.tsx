"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { SiteLogo } from "@/components/SiteLogo";
import { createClient } from "@/lib/supabase/client";
import { adminAr as a } from "@/locales/admin-ar";
import { useAdminAssistant } from "./AdminAssistantContext";
import {
  AnalyticsIcon,
  AssistantIcon,
  CloseIcon,
  HomeIcon,
  LogoutIcon,
  MenuIcon,
  OrdersIcon,
  ProductsIcon,
  StoreIcon,
} from "./AdminIcons";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  exact?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: a.nav.home, icon: HomeIcon, exact: true },
  { href: "/admin/products", label: a.nav.products, icon: ProductsIcon },
  { href: "/admin/orders", label: a.nav.orders, icon: OrdersIcon },
  { href: "/admin/analytics", label: a.nav.analytics, icon: AnalyticsIcon },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/admin";
  const router = useRouter();
  const { open: assistantOpen, openAssistant } = useAdminAssistant();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Close the mobile drawer on route change.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  const activeItem = useMemo(() => {
    // Most-specific match wins so /admin/products/new still highlights Products.
    let best: NavItem | null = null;
    for (const item of NAV_ITEMS) {
      if (isActive(pathname, item)) {
        if (!best || item.href.length > best.href.length) best = item;
      }
    }
    return best;
  }, [pathname]);

  async function onLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await createClient().auth.signOut();
    } catch {
      // Best-effort: still send the admin to the login screen.
    }
    router.replace("/admin/login");
    router.refresh();
  }

  const sidebarBody = (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link href="/admin" className="flex items-center gap-2 px-1">
        <span className="sr-only">{a.nav.title}</span>
        <SiteLogo alt="" objectAlign="start" />
      </Link>

      <nav className="flex-1 space-y-6 overflow-y-auto">
        <div className="space-y-1">
          <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
            {a.shell.sectionMain}
          </p>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                className="admin-nav-link"
                data-active={activeItem?.href === item.href}
              >
                <Icon size={20} className="shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setDrawerOpen(false);
              openAssistant();
            }}
            className="admin-nav-link w-full justify-start text-start"
            data-active={assistantOpen}
          >
            <AssistantIcon size={20} className="shrink-0" />
            <span className="truncate">{a.nav.assistant}</span>
          </button>
        </div>

        <div className="space-y-1">
          <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
            {a.shell.sectionSettings}
          </p>
          <Link href="/" className="admin-nav-link" target="_blank" rel="noopener noreferrer">
            <StoreIcon size={20} className="shrink-0" />
            <span className="truncate">{a.nav.storefront}</span>
          </Link>
        </div>
      </nav>

      <button
        type="button"
        onClick={() => void onLogout()}
        disabled={loggingOut}
        className="admin-nav-link w-full justify-start text-start hover:!bg-red-500/10 hover:!text-red-300 disabled:opacity-60"
      >
        <LogoutIcon size={20} className="shrink-0" />
        <span className="truncate">{loggingOut ? a.shell.loggingOut : a.shell.logout}</span>
      </button>
    </div>
  );

  return (
    <div className="min-h-screen lg:ps-64">
      {/* Desktop sidebar */}
      <aside className="admin-glass fixed inset-y-0 start-0 z-30 hidden w-64 border-e lg:block">
        {sidebarBody}
      </aside>

      {/* Mobile slide-in drawer */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${drawerOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!drawerOpen}
      >
        <button
          type="button"
          aria-label={a.shell.closeMenu}
          onClick={() => setDrawerOpen(false)}
          className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${
            drawerOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <aside
          className={`admin-glass absolute inset-y-0 start-0 w-[82%] max-w-xs border-e shadow-2xl transition-transform duration-300 ease-out ${
            drawerOpen ? "translate-x-0" : "ltr:-translate-x-full rtl:translate-x-full"
          }`}
        >
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label={a.shell.closeMenu}
            className="absolute end-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--admin-border-strong)] text-[var(--muted)] transition hover:text-[var(--foreground)]"
          >
            <CloseIcon size={20} />
          </button>
          {sidebarBody}
        </aside>
      </div>

      {/* Top app bar */}
      <header className="admin-glass sticky top-0 z-20 border-b">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={a.shell.openMenu}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--admin-border-strong)] text-[var(--foreground)] transition hover:bg-white/[0.06] lg:hidden"
          >
            <MenuIcon size={22} />
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold leading-tight text-[var(--foreground)] sm:text-lg">
              {activeItem?.label ?? a.nav.title}
            </h1>
            <p className="hidden text-xs text-[var(--muted)] sm:block">{a.shell.brandTagline}</p>
          </div>

          <Link
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-2 rounded-xl border border-[var(--admin-border-strong)] px-3 py-2 text-xs font-semibold text-[var(--muted)] transition hover:text-[var(--foreground)] sm:inline-flex"
          >
            <StoreIcon size={16} />
            {a.shell.viewStore}
          </Link>

          <Link href="/admin" className="lg:hidden" aria-label={a.nav.title}>
            <SiteLogo alt="" objectAlign="end" />
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="admin-fade-in mx-auto max-w-6xl px-4 pb-28 pt-6 text-start lg:pb-10">
        {children}
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="admin-glass fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto flex max-w-md items-stretch gap-1 px-2 py-1.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                className="admin-bottom-link"
                data-active={activeItem?.href === item.href}
              >
                <Icon size={22} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setDrawerOpen(false);
              openAssistant();
            }}
            className="admin-bottom-link"
            data-active={assistantOpen}
            aria-label={a.nav.assistant}
          >
            <AssistantIcon size={22} />
            <span className="truncate">{a.nav.assistant}</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
