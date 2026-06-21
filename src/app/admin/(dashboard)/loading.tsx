import { adminAr as a } from "@/locales/admin-ar";

/**
 * Instant Suspense fallback for every dynamic panel under `/admin/*`.
 *
 * Without this boundary, the App Router blocks the client-side transition
 * until the `force-dynamic` server component finishes its Supabase fetch,
 * which is what caused the multi-second lag when switching sidebar sections.
 * With it, navigation is instant: this skeleton renders immediately (and is
 * prefetchable via <Link>) while data streams in.
 */
export default function AdminDashboardLoading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-live="polite">
      <span className="sr-only">{a.common.loading}</span>
      <div className="h-7 w-48 rounded bg-[var(--accent-muted)]/60" />
      <div className="mt-3 h-4 w-72 max-w-full rounded bg-[var(--accent-muted)]/40" />
      <div className="mt-8 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-16 w-full rounded-lg border border-[var(--accent-muted)]/40 bg-[var(--card)]"
          />
        ))}
      </div>
    </div>
  );
}
