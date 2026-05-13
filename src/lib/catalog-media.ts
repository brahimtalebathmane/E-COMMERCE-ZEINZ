/** Thumbnail helpers for catalog cards (lightweight subset of landing media logic). */

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

export function muxPosterUrl(playbackId: string): string {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=0&width=720&fit_mode=preserve`;
}

function cloudflareStreamVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "iframe.videodelivery.net") {
      const seg = u.pathname.split("/").filter(Boolean)[0];
      return seg ?? null;
    }
    if (
      /\.cloudflarestream\.com$/i.test(u.hostname) &&
      /\/iframe\/?$/i.test(u.pathname)
    ) {
      const seg = u.pathname.split("/").filter(Boolean)[0];
      return seg ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

export function catalogVideoPosterUrl(url: string): string | null {
  const muxId = muxPlaybackIdFromUrl(url);
  if (muxId) return muxPosterUrl(muxId);
  const cfId = cloudflareStreamVideoId(url);
  if (cfId) return `https://videodelivery.net/${cfId}/thumbnails/thumbnail.jpg?height=480`;
  return null;
}

export function isDirectVideoFileUrl(url: string): boolean {
  return /\.(mp4|webm|ogg|mov)($|\?)/i.test(url.trim());
}
