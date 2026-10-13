"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { SiteLogo } from "@/components/SiteLogo";
import { createClient } from "@/lib/supabase/client";
import { adminAr as a } from "@/locales/admin-ar";
import { useAdminAssistant } from "./AdminAssistantContext";
import { useAdminAccess } from "./AdminPermissionsContext";
import { useAdminCountryScope } from "./AdminCountryContext";
import { setAdminCountryAction } from "@/lib/auth/country-scope-actions";
import { hasLocalOperations } from "@/lib/local-operations";
import {
  PERMISSIONS,
  type PermissionKey,
} from "@/lib/auth/permissions";
import {
  AnalyticsIcon,
  AssistantIcon,
  AuditIcon,
  ChatIcon,
  ChevronIcon,
  CloseIcon,
  GlobeIcon,
  HomeIcon,
  InventoryIcon,
  TreasuryIcon,
  LogoutIcon,
  MetaIcon,
  MoreIcon,
  OrdersIcon,
  ProductsIcon,
  SaleIcon,
  StaffIcon,
  StoreIcon,
} from "./AdminIcons";

// Loaded on first open only: the form (and its actions) never weighs on pages
// where nobody records a sale.
const WhatsAppSaleForm = dynamic(
  () => import("@/app/admin/(dashboard)/orders/WhatsAppSaleForm").then((m) => m.WhatsAppSaleForm),
  { ssr: false },
);

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  exact?: boolean;
  permission?: PermissionKey;
  /** Any one of these is enough (used when read and write permissions differ). */
  anyPermission?: PermissionKey[];
  ownerOnly?: boolean;
  /** Inventory/treasury: only while the local-operations market is selected. */
  localOperationsOnly?: boolean;
};

const ALL_NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: a.nav.home, icon: HomeIcon, exact: true },
  {
    href: "/admin/orders",
    label: a.nav.orders,
    icon: OrdersIcon,
    permission: PERMISSIONS.view_orders,
  },
  {
    href: "/admin/inventory",
    label: a.nav.inventory,
    icon: InventoryIcon,
    permission: PERMISSIONS.manage_inventory,
    localOperationsOnly: true,
  },
  {
    href: "/admin/treasury",
    label: a.nav.treasury,
    icon: TreasuryIcon,
    anyPermission: [PERMISSIONS.view_treasury, PERMISSIONS.manage_treasury],
    localOperationsOnly: true,
  },
  {
    href: "/admin/products",
    label: a.nav.products,
    icon: ProductsIcon,
    permission: PERMISSIONS.manage_products,
  },
  {
    href: "/admin/analytics",
    label: a.nav.analytics,
    icon: AnalyticsIcon,
    permission: PERMISSIONS.view_analytics,
  },
  {
    href: "/admin/meta",
    label: a.nav.meta,
    icon: MetaIcon,
    permission: PERMISSIONS.view_meta_monitoring,
  },
  {
    href: "/admin/marketing",
    label: a.nav.marketing,
    icon: ChatIcon,
    permission: PERMISSIONS.marketing_messages,
  },
];

/**
 * Bottom tab bar on the phone: Orders, WhatsApp sale, Inventory, Treasury,
 * then More. Outside the local-operations market (no sale form, no stock, no
 * cash) the free slots fall back to Home, Products and Analytics. Every page
 * stays reachable from More.
 */
const TAB_ORDER = ["/admin/orders", "sale", "/admin/inventory", "/admin/treasury", "/admin", "/admin/products", "/admin/analytics"];
const TAB_SLOTS = 4;

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

const ROW_ICON_TINT: Record<string, string> = {
  "/admin": "bg-[var(--hue-slate-bg)] text-[var(--hue-slate-fg)]",
  "/admin/orders": "bg-[var(--hue-sky-bg)] text-[var(--hue-sky-fg)]",
  "/admin/inventory": "bg-[var(--hue-violet-bg)] text-[var(--hue-violet-fg)]",
  "/admin/treasury": "bg-[var(--hue-emerald-bg)] text-[var(--hue-emerald-fg)]",
  "/admin/products": "bg-[var(--hue-amber-bg)] text-[var(--hue-amber-fg)]",
  "/admin/analytics": "bg-[var(--hue-emerald-bg)] text-[var(--hue-emerald-fg)]",
  "/admin/meta": "bg-[var(--hue-sky-bg)] text-[var(--hue-sky-fg)]",
  "/admin/marketing": "bg-[var(--hue-emerald-bg)] text-[var(--hue-emerald-fg)]",
};

/** One iOS-style list row: tinted icon, label, forward chevron. */
function SheetRow({
  icon: Icon,
  label,
  tint,
  active,
  danger,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  tint: string;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tint}`}>
        <Icon size={18} />
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-[17px] ${danger ? "text-[var(--danger)]" : ""} ${
          active ? "font-semibold text-[var(--accent)]" : ""
        }`}
      >
        {label}
      </span>
      {danger ? null : <ChevronIcon size={16} className="shrink-0 text-[var(--muted)] opacity-60 rtl:-scale-x-100" />}
    </>
  );
}

const ROW_CLASS =
  "flex min-h-[48px] w-full touch-manipulation items-center gap-3 px-4 py-2 text-start transition-colors active:bg-[var(--fill)] disabled:opacity-60";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/admin";
  const router = useRouter();
  const access = useAdminAccess();
  const { countries, selectedCountryId } = useAdminCountryScope();
  const { open: assistantOpen, openAssistant } = useAdminAssistant();
  const [moreOpen, setMoreOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [switchingCountry, setSwitchingCountry] = useState(false);

  async function onCountryChange(nextId: string) {
    if (!nextId || nextId === selectedCountryId || switchingCountry) return;
    setSwitchingCountry(true);
    try {
      await setAdminCountryAction(nextId);
    } finally {
      router.refresh();
      setSwitchingCountry(false);
    }
  }

  const selectedHasLocalOperations = hasLocalOperations(
    countries.find((c) => c.id === selectedCountryId),
  );

  const navItems = useMemo(() => {
    return ALL_NAV_ITEMS.filter((item) => {
      if (item.localOperationsOnly && !selectedHasLocalOperations) return false;
      if (item.anyPermission) {
        return access.isOwner || item.anyPermission.some((p) => access.permissions.includes(p));
      }
      if (!item.permission) return true;
      return access.isOwner || access.permissions.includes(item.permission);
    });
  }, [access, selectedHasLocalOperations]);

  // Same rule as the orders page button: confirm_orders, local-operations market only.
  const canRecordSale = selectedHasLocalOperations && (access.isOwner || access.permissions.includes(PERMISSIONS.confirm_orders));

  const tabs = useMemo(() => {
    const out: (NavItem | "sale")[] = [];
    for (const key of TAB_ORDER) {
      if (out.length >= TAB_SLOTS) break;
      if (key === "sale") {
        if (canRecordSale) out.push("sale");
        continue;
      }
      const item = navItems.find((n) => n.href === key);
      if (item) out.push(item);
    }
    return out;
  }, [navItems, canRecordSale]);

  const tabHrefs = useMemo(
    () => new Set(tabs.filter((t): t is NavItem => t !== "sale").map((t) => t.href)),
    [tabs],
  );

  const activeItem = useMemo(() => {
    let best: NavItem | null = null;
    const candidates = [...navItems];
    if (access.isOwner) {
      candidates.push({ href: "/admin/staff", label: a.nav.staff, icon: StaffIcon });
      candidates.push({ href: "/admin/countries", label: a.nav.countries, icon: GlobeIcon });
      candidates.push({ href: "/admin/audit", label: a.owner.auditNav, icon: AuditIcon });
    }
    for (const item of candidates) {
      if (isActive(pathname, item)) {
        if (!best || item.href.length > best.href.length) best = item;
      }
    }
    return best;
  }, [pathname, navItems, access.isOwner]);

  const moreActive = assistantOpen || (activeItem !== null && !tabHrefs.has(activeItem.href));

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

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

  const countrySelect = (className: string) =>
    countries.length > 1 ? (
      <select
        aria-label={a.shell.countryScope}
        value={selectedCountryId}
        disabled={switchingCountry}
        onChange={(e) => void onCountryChange(e.target.value)}
        className={className}
      >
        {countries.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name_ar}
          </option>
        ))}
      </select>
    ) : null;

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link href="/admin" className="flex items-center gap-2 px-1">
        <span className="sr-only">{a.nav.title}</span>
        <SiteLogo alt="" objectAlign="start" />
      </Link>

      <nav className="flex-1 space-y-6 overflow-y-auto">
        <div className="space-y-1">
          <p className="px-3 pb-1 text-[13px] font-medium text-[var(--muted)]">{a.shell.sectionMain}</p>
          {navItems.map((item) => {
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
          {canRecordSale ? (
            <button type="button" onClick={() => setSaleOpen(true)} className="admin-nav-link w-full justify-start text-start">
              <SaleIcon size={20} className="shrink-0" />
              <span className="truncate">{a.shell.saleTab}</span>
            </button>
          ) : null}
          {access.isOwner ? (
            <button
              type="button"
              onClick={openAssistant}
              className="admin-nav-link w-full justify-start text-start"
              data-active={assistantOpen}
            >
              <AssistantIcon size={20} className="shrink-0" />
              <span className="truncate">{a.nav.assistant}</span>
            </button>
          ) : null}
        </div>

        <div className="space-y-1">
          <p className="px-3 pb-1 text-[13px] font-medium text-[var(--muted)]">{a.shell.sectionSettings}</p>
          {access.isOwner ? (
            <Link href="/admin/staff" prefetch className="admin-nav-link" data-active={pathname.startsWith("/admin/staff")}>
              <StaffIcon size={20} className="shrink-0" />
              <span className="truncate">{a.nav.staff}</span>
            </Link>
          ) : null}
          {access.isOwner ? (
            <Link href="/admin/countries" prefetch className="admin-nav-link" data-active={pathname.startsWith("/admin/countries")}>
              <GlobeIcon size={20} className="shrink-0" />
              <span className="truncate">{a.nav.countries}</span>
            </Link>
          ) : null}
          {access.isOwner ? (
            <Link href="/admin/audit" prefetch className="admin-nav-link" data-active={pathname.startsWith("/admin/audit")}>
              <AuditIcon size={20} className="shrink-0" />
              <span className="truncate">{a.owner.auditNav}</span>
            </Link>
          ) : null}
          <Link
            href="/"
            className="admin-nav-link"
            target="_blank"
            rel="noopener noreferrer"
            title="يفتح المتجر العام في تبويب جديد — لا توجد صفحة إعدادات متجر بعد"
          >
            <StoreIcon size={20} className="shrink-0" />
            <span className="truncate">{a.shell.viewStore}</span>
          </Link>
        </div>
      </nav>

      <button
        type="button"
        onClick={() => void onLogout()}
        disabled={loggingOut}
        className="admin-nav-link w-full justify-start text-start !text-[var(--danger)] disabled:opacity-60"
      >
        <LogoutIcon size={20} className="shrink-0" />
        <span className="truncate">{loggingOut ? a.shell.loggingOut : a.shell.logout}</span>
      </button>
    </div>
  );

  const moreItems = navItems.filter((item) => !tabHrefs.has(item.href));

  const moreSheet = (
    <div className={`fixed inset-0 z-50 lg:hidden ${moreOpen ? "" : "pointer-events-none"}`} aria-hidden={!moreOpen}>
      <button
        type="button"
        aria-label={a.shell.closeMenu}
        tabIndex={moreOpen ? 0 : -1}
        onClick={() => setMoreOpen(false)}
        className={`absolute inset-0 bg-[var(--overlay)] transition-opacity duration-300 motion-reduce:transition-none ${
          moreOpen ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-[22px] bg-[var(--background)] shadow-[var(--admin-shadow-lg)] transition-transform duration-300 ease-out motion-reduce:transition-none ${
          moreOpen ? "translate-y-0" : "translate-y-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={a.shell.moreNav}
      >
        <div className="flex shrink-0 flex-col items-center px-4 pt-2">
          <span className="h-[5px] w-9 rounded-full bg-[var(--fill-strong)]" aria-hidden />
          <div className="flex w-full items-center justify-between pt-2">
            <p className="text-[20px] font-bold">{a.shell.more}</p>
            <button
              type="button"
              onClick={() => setMoreOpen(false)}
              aria-label={a.shell.closeMenu}
              tabIndex={moreOpen ? 0 : -1}
              className="inline-flex h-11 w-11 touch-manipulation items-center justify-center"
            >
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[var(--fill-strong)] text-[var(--muted)]">
                <CloseIcon size={14} />
              </span>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3">
          <section>
            <p className="px-4 pb-1.5 text-[13px] text-[var(--muted)]">{a.shell.account}</p>
            <div className="overflow-hidden rounded-[14px] bg-[var(--card)]">
              <div className="flex min-h-[56px] items-center gap-3 border-b border-[var(--admin-border)] px-4 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px]">{access.displayName || access.email || a.shell.brandTagline}</p>
                  {access.displayName && access.email ? (
                    <p className="truncate text-[13px] text-[var(--muted)]" dir="ltr">{access.email}</p>
                  ) : null}
                </div>
              </div>
              {countries.length > 1 ? (
                <label className="flex min-h-[48px] items-center gap-3 px-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--hue-sky-bg)] text-[var(--hue-sky-fg)]">
                    <GlobeIcon size={18} />
                  </span>
                  <span className="flex-1 text-[17px]">{a.shell.countryScope}</span>
                  {countrySelect(
                    "min-h-[44px] max-w-[45%] rounded-[10px] bg-transparent text-end text-base text-[var(--muted)] outline-none disabled:opacity-60",
                  )}
                </label>
              ) : null}
            </div>
          </section>

          <section>
            <p className="px-4 pb-1.5 text-[13px] text-[var(--muted)]">{a.shell.pages}</p>
            <div className="divide-y divide-[var(--admin-border)] overflow-hidden rounded-[14px] bg-[var(--card)]">
              {moreItems.map((item) => (
                <Link key={item.href} href={item.href} prefetch className={ROW_CLASS} onClick={() => setMoreOpen(false)}>
                  <SheetRow
                    icon={item.icon}
                    label={item.label}
                    tint={ROW_ICON_TINT[item.href] ?? "bg-[var(--fill)]"}
                    active={activeItem?.href === item.href}
                  />
                </Link>
              ))}
              {access.isOwner ? (
                <button
                  type="button"
                  className={ROW_CLASS}
                  onClick={() => {
                    setMoreOpen(false);
                    openAssistant();
                  }}
                >
                  <SheetRow icon={AssistantIcon} label={a.nav.assistant} tint="bg-[var(--hue-violet-bg)] text-[var(--hue-violet-fg)]" />
                </button>
              ) : null}
            </div>
          </section>

          <section>
            <p className="px-4 pb-1.5 text-[13px] text-[var(--muted)]">{a.shell.sectionSettings}</p>
            <div className="divide-y divide-[var(--admin-border)] overflow-hidden rounded-[14px] bg-[var(--card)]">
              {access.isOwner ? (
                <>
                  <Link href="/admin/staff" prefetch className={ROW_CLASS} onClick={() => setMoreOpen(false)}>
                    <SheetRow icon={StaffIcon} label={a.nav.staff} tint="bg-[var(--hue-slate-bg)] text-[var(--hue-slate-fg)]" active={pathname.startsWith("/admin/staff")} />
                  </Link>
                  <Link href="/admin/countries" prefetch className={ROW_CLASS} onClick={() => setMoreOpen(false)}>
                    <SheetRow icon={GlobeIcon} label={a.nav.countries} tint="bg-[var(--hue-sky-bg)] text-[var(--hue-sky-fg)]" active={pathname.startsWith("/admin/countries")} />
                  </Link>
                  <Link href="/admin/audit" prefetch className={ROW_CLASS} onClick={() => setMoreOpen(false)}>
                    <SheetRow icon={AuditIcon} label={a.owner.auditNav} tint="bg-[var(--hue-amber-bg)] text-[var(--hue-amber-fg)]" active={pathname.startsWith("/admin/audit")} />
                  </Link>
                </>
              ) : null}
              <Link
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                className={ROW_CLASS}
                onClick={() => setMoreOpen(false)}
              >
                <SheetRow icon={StoreIcon} label={a.shell.viewStore} tint="bg-[var(--hue-amber-bg)] text-[var(--hue-amber-fg)]" />
              </Link>
            </div>
          </section>

          <div className="overflow-hidden rounded-[14px] bg-[var(--card)]">
            <button type="button" onClick={() => void onLogout()} disabled={loggingOut} className={ROW_CLASS}>
              <SheetRow
                icon={LogoutIcon}
                label={loggingOut ? a.shell.loggingOut : a.shell.logout}
                tint="bg-[var(--hue-red-bg)] text-[var(--hue-red-fg)]"
                danger
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:ps-64">
      <aside className="admin-glass fixed inset-y-0 start-0 z-30 hidden w-64 border-e lg:block">{sidebar}</aside>

      {moreSheet}

      <header className="admin-glass sticky top-0 z-20 border-b pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex min-h-[44px] max-w-6xl items-center gap-3 px-4 py-1.5">
          <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">{activeItem?.label ?? a.nav.title}</p>
          {countrySelect(
            "min-h-[36px] rounded-[10px] bg-[var(--fill)] px-2 text-[13px] font-semibold text-[var(--foreground)] outline-none disabled:opacity-60 lg:min-h-[40px] lg:text-sm",
          )}
          <Link
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden min-h-[40px] items-center gap-2 rounded-[10px] bg-[var(--fill)] px-3 text-sm font-semibold text-[var(--accent)] lg:inline-flex"
          >
            <StoreIcon size={16} />
            {a.shell.viewStore}
          </Link>
        </div>
      </header>

      <main className="admin-fade-in mx-auto max-w-6xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 text-start lg:pb-10 lg:pt-6">
        {children}
      </main>

      <nav
        className="admin-glass fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label={a.shell.menu}
      >
        <div className="mx-auto flex max-w-md items-stretch px-1 pt-1">
          {tabs.map((tab) =>
            tab === "sale" ? (
              <button key="sale" type="button" onClick={() => setSaleOpen(true)} className="admin-bottom-link" data-active={saleOpen}>
                <SaleIcon size={24} />
                <span className="max-w-[4.5rem] truncate">{a.shell.saleTab}</span>
              </button>
            ) : (
              <Link
                key={tab.href}
                href={tab.href}
                prefetch
                className="admin-bottom-link"
                data-active={!saleOpen && !moreOpen && activeItem?.href === tab.href}
                aria-current={activeItem?.href === tab.href ? "page" : undefined}
              >
                <tab.icon size={24} />
                <span className="max-w-[4.5rem] truncate">{tab.label}</span>
              </Link>
            ),
          )}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="admin-bottom-link"
            data-active={moreOpen || (!saleOpen && moreActive)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
          >
            <MoreIcon size={24} />
            <span className="max-w-[4.5rem] truncate">{a.shell.more}</span>
          </button>
        </div>
      </nav>

      {canRecordSale && saleOpen ? <WhatsAppSaleForm open={saleOpen} onClose={() => setSaleOpen(false)} /> : null}
    </div>
  );
}
