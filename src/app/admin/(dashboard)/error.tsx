"use client";

import { useEffect } from "react";
import { adminAr as a } from "@/locales/admin-ar";

/**
 * Client error boundary for every panel under `/admin/*`.
 *
 * Without this boundary a runtime throw during render (for example a malformed
 * timestamp blowing up an `Intl` formatter, or an undefined field access while
 * building the order-details modal) bubbles past the `loading.tsx` skeleton and
 * leaves the panel stuck on a never-ending spinner / blank screen. This boundary
 * guarantees the loading state always terminates: any crash is caught and a
 * professional, retryable error card is shown to the administrator instead.
 */
export default function AdminDashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin/dashboard] render error", error);
  }, [error]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="admin-card mx-auto mt-10 flex max-w-lg flex-col items-center gap-4 px-6 py-10 text-center"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-red-400/40 bg-red-400/10 text-2xl text-red-300">
        !
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          {a.common.errorTitle}
        </h2>
        <p className="text-sm text-[var(--muted)]">{a.common.errorBody}</p>
      </div>
      <button
        type="button"
        onClick={() => reset()}
        className="min-h-[44px] rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] px-5 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--accent-muted)]/20"
      >
        {a.common.retry}
      </button>
    </div>
  );
}
