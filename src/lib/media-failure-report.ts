/**
 * Best-effort report of a broken landing/catalog image (Layer 3 of the
 * media-reliability chain — see next.config.ts remotePatterns / actions.ts
 * media validation for the other layers). Fire-and-forget — never throws
 * or blocks the page. Same shape as meta-client-failure-report.ts.
 */
export function reportMediaFailure(params: {
  slug: string;
  slot: "hero" | "secondary" | "tertiary" | "catalog";
  url: string;
}): void {
  const slug = params.slug.trim();
  const url = params.url.trim();
  if (!slug || !url) return;

  void fetch("/api/media/report-failure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, slot: params.slot, url }),
    keepalive: true,
  }).catch(() => {
    // Silent — reporting must not create error loops.
  });
}
