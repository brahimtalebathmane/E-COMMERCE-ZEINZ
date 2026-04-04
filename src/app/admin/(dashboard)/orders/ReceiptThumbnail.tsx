"use client";

import { useEffect, useState } from "react";
import { adminAr as a } from "@/locales/admin-ar";

type Props = {
  storagePath: string | null;
  variant?: "list" | "full";
  className?: string;
};

export function ReceiptThumbnail({ storagePath, variant = "list", className = "" }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(Boolean(storagePath));

  useEffect(() => {
    if (!storagePath) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFailed(false);
      try {
        const res = await fetch(
          `/api/admin/signed-url?path=${encodeURIComponent(storagePath)}`,
        );
        const json = (await res.json()) as { signedUrl?: string };
        if (!cancelled && res.ok && json.signedUrl) {
          setUrl(json.signedUrl);
        } else if (!cancelled) {
          setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  const frame =
    variant === "list"
      ? "h-16 w-16 sm:h-[72px] sm:w-[72px] shrink-0 rounded-xl"
      : "flex min-h-[200px] w-full items-center justify-center rounded-2xl";

  if (!storagePath) {
    return (
      <div
        className={`flex items-center justify-center bg-[var(--card)] text-center text-xs leading-snug text-[var(--muted)] ${frame} ${className}`}
      >
        {a.orders.noReceiptShort}
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className={`animate-pulse bg-[var(--accent-muted)]/30 ${frame} ${className}`}
        aria-hidden
      />
    );
  }

  if (failed || !url) {
    return (
      <div
        className={`flex items-center justify-center border border-dashed border-[var(--accent-muted)] text-center text-[10px] text-[var(--muted)] ${frame} ${className}`}
      >
        {a.orders.receiptLoadError}
      </div>
    );
  }

  if (variant === "full") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL; dynamic per order
      <img
        src={url}
        alt=""
        className={`max-h-[min(70vh,520px)] w-full rounded-2xl border border-[var(--accent-muted)] bg-[var(--card)] object-contain ${className}`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className={`border border-[var(--accent-muted)] bg-[var(--card)] object-cover ${frame} ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
