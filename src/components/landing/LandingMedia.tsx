"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import type { ProductRow } from "@/types";

const MuxPlayer = dynamic(
  () => import("@mux/mux-player-react/lazy").then((mod) => mod.default),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex aspect-video w-full min-h-[12rem] items-center justify-center bg-black text-sm text-white/60"
        aria-hidden
      >
        …
      </div>
    ),
  },
);

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

function isMuxHostedUrl(url: string): boolean {
  return /(?:stream|player|watch)\.mux\.com/i.test(url);
}

function muxPosterUrl(playbackId: string): string {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=0&width=1280&fit_mode=preserve`;
}

/** Cloudflare Stream embed (adaptive playback inside iframe). */
function isCloudflareStreamEmbedUrl(url: string): boolean {
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

function isCloudflareStreamHlsUrl(url: string): boolean {
  return /cloudflarestream\.com/i.test(url) && /\.m3u8($|\?)/i.test(url);
}

type Props = {
  product: ProductRow;
  priority?: boolean;
};

const muxPlayerCommon = {
  streamType: "on-demand" as const,
  accentColor: "#00ff00",
  playsInline: true,
  preload: "metadata" as const,
  capRenditionToPlayerSize: true,
};

const muxPlayerLayoutClass =
  "absolute inset-0 block h-full w-full max-h-full max-w-full";

export function LandingMedia({ product, priority }: Props) {
  const url = product.media_url?.trim() ?? "";

  if (!url) {
    return (
      <div className="flex aspect-video w-full min-h-[12rem] items-center justify-center bg-[var(--accent-muted)] text-sm text-[var(--muted)]">
        —
      </div>
    );
  }

  const muxPlaybackId = muxPlaybackIdFromUrl(url);
  const treatAsImage =
    product.media_type === "image" && !isHls(url) && !muxPlaybackId;

  if (treatAsImage) {
    return (
      <div className="relative aspect-video w-full min-w-0 max-h-[min(85vh,56rem)] bg-[var(--accent-muted)]">
        <Image
          src={url}
          alt={product.name}
          fill
          className="object-contain sm:object-cover"
          sizes="100vw"
          priority={priority}
          fetchPriority={priority ? "high" : "auto"}
        />
      </div>
    );
  }

  if (isCloudflareStreamEmbedUrl(url)) {
    return (
      <div className="relative aspect-video w-full min-h-0 min-w-0 overflow-hidden bg-black">
        <iframe
          src={url}
          title={product.name}
          className="absolute inset-0 h-full w-full border-0"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          loading={priority ? "eager" : "lazy"}
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  /** Mux (HLS ABR) or generic HLS / Cloudflare Stream manifest — mux-player uses adaptive streaming. */
  if (
    muxPlaybackId ||
    isHls(url) ||
    isMuxHostedUrl(url) ||
    isCloudflareStreamHlsUrl(url)
  ) {
    const placeholder = muxPlaybackId ? muxPosterUrl(muxPlaybackId) : undefined;
    return (
      <div className="relative aspect-video w-full min-h-0 min-w-0 overflow-hidden bg-black">
        {muxPlaybackId ? (
          <MuxPlayer
            playbackId={muxPlaybackId}
            {...muxPlayerCommon}
            placeholder={placeholder}
            poster={placeholder}
            metadataVideoTitle={product.name}
            className={muxPlayerLayoutClass}
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <MuxPlayer
            src={url}
            {...muxPlayerCommon}
            metadataVideoTitle={product.name}
            className={muxPlayerLayoutClass}
            style={{ width: "100%", height: "100%" }}
          />
        )}
      </div>
    );
  }

  return (
    <video
      className="aspect-video w-full min-h-0 min-w-0 max-h-[min(85vh,56rem)] max-w-full bg-black object-contain"
      src={url}
      controls
      playsInline
      preload="none"
      {...(priority ? { fetchPriority: "high" as const } : {})}
    />
  );
}
