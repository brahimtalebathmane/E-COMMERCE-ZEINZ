/**
 * Canonical video-URL detection — Mux (HLS/hosted player), generic HLS
 * manifests, and Cloudflare Stream (iframe embed + HLS). Single source of
 * truth: `landing-hero-image.ts`, `LandingMedia.tsx`, the media-URL
 * validator, and the media audit script all import from here instead of
 * keeping their own copies of these regexes.
 */

export function isHlsUrl(url: string): boolean {
  return /\.m3u8($|\?)/i.test(url) || /stream\.mux\.com/i.test(url);
}

export function muxPlaybackIdFromUrl(url: string): string | null {
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

export function isMuxHostedUrl(url: string): boolean {
  return /(?:stream|player|watch)\.mux\.com/i.test(url);
}

/** Cloudflare Stream embed (adaptive playback inside iframe). */
export function isCloudflareStreamEmbedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname === "iframe.videodelivery.net") return true;
    if (
      /\.cloudflarestream\.com$/i.test(u.hostname) &&
      /\/iframe\/?$/i.test(u.pathname)
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function isCloudflareStreamHlsUrl(url: string): boolean {
  return /cloudflarestream\.com/i.test(url) && /\.m3u8($|\?)/i.test(url);
}

/**
 * True when the URL is a recognised video source (Mux hosted/HLS, generic
 * HLS manifest, or Cloudflare Stream embed/HLS) rather than a static image.
 * Used to skip the HEAD/content-type image check in validation and the
 * media audit script — video URLs are validated by playback, not by probing.
 */
export function isVideoMediaUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  return (
    Boolean(muxPlaybackIdFromUrl(u)) ||
    isHlsUrl(u) ||
    isMuxHostedUrl(u) ||
    isCloudflareStreamEmbedUrl(u) ||
    isCloudflareStreamHlsUrl(u)
  );
}
