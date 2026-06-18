/** Shared Next/Image tuning for above-the-fold landing hero photos. */
export const LANDING_HERO_IMAGE = {
  width: 1920,
  height: 1280,
  sizes: "100vw",
  quality: 85,
} as const;

function isHls(url: string) {
  return /\.m3u8($|\?)/i.test(url) || /stream\.mux\.com/i.test(url);
}

function muxPlaybackIdFromUrl(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  const patterns = [
    /stream\.mux\.com\/([a-zA-Z0-9]+)/i,
    /player\.mux\.com\/(?:embed\/)?([a-zA-Z0-9]+)/i,
    /watch\.mux\.com\/([a-zA-Z0-9]+)/i,
  ];
  for (const re of patterns) {
    const m = u.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** True when the hero slot should render a static photo (not HLS/Mux video). */
export function isLandingHeroStaticImage(
  mediaType: "image" | "video" | string | undefined,
  mediaUrl: string | undefined,
): boolean {
  const url = (mediaUrl ?? "").trim();
  if (!url || (mediaType ?? "image") !== "image") return false;
  if (isHls(url) || muxPlaybackIdFromUrl(url)) return false;
  return true;
}
