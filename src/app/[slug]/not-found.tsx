import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold">Product not found</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        This page may have moved. Try opening the latest link from your seller.
      </p>
      <Link
        href="/"
        className="mt-6 text-sm font-medium text-[var(--accent)] underline"
      >
        Back home
      </Link>
    </div>
  );
}
