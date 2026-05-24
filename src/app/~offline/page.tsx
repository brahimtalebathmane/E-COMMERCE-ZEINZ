import Link from "next/link";
import { SiteLogo } from "@/components/SiteLogo";
import { BRAND_NAME } from "@/lib/site-branding";

export const metadata = {
  title: `Offline — ${BRAND_NAME}`,
};

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <SiteLogo priority />
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">You&apos;re offline</h1>
        <p className="text-sm text-[var(--muted)]">
          Check your connection, then reload to continue shopping on {BRAND_NAME}.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--accent-foreground)]"
      >
        Try again
      </Link>
    </main>
  );
}
