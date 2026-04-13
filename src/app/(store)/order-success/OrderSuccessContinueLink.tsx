"use client";

import Link from "next/link";
import { clearMetaSessionEventId } from "@/lib/meta-client";

export function OrderSuccessContinueLink() {
  return (
    <p className="mt-6 text-center text-sm text-[var(--muted)]">
      <Link
        href="/"
        onClick={() => clearMetaSessionEventId()}
        className="font-semibold text-[var(--accent)] underline underline-offset-2 hover:opacity-90"
      >
        تصفح المزيد من المنتجات
      </Link>
    </p>
  );
}
