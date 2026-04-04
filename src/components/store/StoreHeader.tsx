"use client";

import Link from "next/link";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SiteLogo } from "@/components/SiteLogo";

export function StoreHeader() {
  return (
    <div className="sticky top-0 z-40 border-b border-[var(--accent-muted)]/60 bg-[var(--background)]/90 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="min-w-0 shrink">
          <SiteLogo priority />
        </Link>
        <LanguageSwitcher />
      </div>
    </div>
  );
}
