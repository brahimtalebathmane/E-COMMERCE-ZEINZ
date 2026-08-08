import { isHlsUrl, muxPlaybackIdFromUrl } from "@/lib/video-media-url";

/** Shared Next/Image tuning for above-the-fold landing hero photos (16:9). */
export const LANDING_HERO_IMAGE = {
  width: 1920,
  height: 1080,
  sizes: "100vw",
  quality: 85,
} as const;

/** True when the hero slot should render a static photo (not HLS/Mux video). */
export function isLandingHeroStaticImage(
  mediaType: "image" | "video" | string | undefined,
  mediaUrl: string | undefined,
): boolean {
  const url = (mediaUrl ?? "").trim();
  if (!url || (mediaType ?? "image") !== "image") return false;
  if (isHlsUrl(url) || muxPlaybackIdFromUrl(url)) return false;
  return true;
}
