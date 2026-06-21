"use client";

import Link from "next/link";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SiteLogo } from "@/components/SiteLogo";

export function StoreHeader() {
  return (
    <div className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/80 pt-[env(safe-area-inset-top)] [backdrop-filter:saturate(160%)_blur(12px)] supports-[backdrop-filter]:bg-[var(--background)]/70">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6 sm:py-3 lg:px-8">
        <Link
          href="/"
          className="min-w-0 shrink rounded-lg outline-none ring-[var(--accent)] transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
          aria-label="Zaine"
        >
          <SiteLogo priority objectAlign="start" />
        </Link>
        <LanguageSwitcher />
      </div>
    </div>
  );
}
