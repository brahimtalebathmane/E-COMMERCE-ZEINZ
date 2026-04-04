"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import type { ProductRow } from "@/types";

const MuxPlayer = dynamic(
  () => import("@mux/mux-player-react").then((mod) => mod.default),
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

/**
 * Mux playback IDs appear in:
 * - https://stream.mux.com/{playbackId}.m3u8
 * - https://player.mux.com/{playbackId} or /embed/{playbackId}
 * - https://watch.mux.com/{playbackId}
 */
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

type Props = {
  product: ProductRow;
  priority?: boolean;
};

const muxPlayerCommon = {
  streamType: "on-demand" as const,
  accentColor: "#00ff00",
  playsInline: true,
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
        />
      </div>
    );
  }

  /** Mux: HLS, stream host, or any URL we can resolve to a playback ID (e.g. player.mux.com/…). */
  if (muxPlaybackId || isHls(url) || isMuxHostedUrl(url)) {
    return (
      <div className="relative aspect-video w-full min-h-0 min-w-0 overflow-hidden bg-black">
        {muxPlaybackId ? (
          <MuxPlayer
            playbackId={muxPlaybackId}
            {...muxPlayerCommon}
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
      preload="metadata"
    />
  );
}
