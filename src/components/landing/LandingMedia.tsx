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

/** Mux hosted streams use https://stream.mux.com/{playbackId}.m3u8 */
function muxPlaybackIdFromUrl(url: string): string | null {
  const m = url.match(/stream\.mux\.com\/([a-zA-Z0-9]+)/i);
  return m?.[1] ?? null;
}

type Props = {
  product: ProductRow;
  priority?: boolean;
};

export function LandingMedia({ product, priority }: Props) {
  const url = product.media_url?.trim() ?? "";

  if (!url) {
    return (
      <div className="flex aspect-video w-full min-h-[12rem] items-center justify-center bg-[var(--accent-muted)] text-sm text-[var(--muted)]">
        —
      </div>
    );
  }

  const treatAsImage = product.media_type === "image" && !isHls(url);

  if (treatAsImage) {
    return (
      <div className="relative aspect-video w-full max-h-[min(85vh,56rem)] bg-[var(--accent-muted)]">
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

  if (isHls(url)) {
    const playbackId = muxPlaybackIdFromUrl(url);
    return (
      <div className="relative w-full overflow-hidden bg-black [&_mux-player]:aspect-video [&_mux-player]:h-auto [&_mux-player]:min-h-[12rem] [&_mux-player]:w-full [&_mux-player]:max-w-full">
        {playbackId ? (
          <MuxPlayer
            playbackId={playbackId}
            streamType="on-demand"
            metadataVideoTitle={product.name}
            accentColor="#c45c26"
          />
        ) : (
          <MuxPlayer
            src={url}
            streamType="on-demand"
            metadataVideoTitle={product.name}
            accentColor="#c45c26"
          />
        )}
      </div>
    );
  }

  return (
    <video
      className="aspect-video w-full max-h-[min(85vh,56rem)] bg-black object-contain"
      src={url}
      controls
      playsInline
      preload="metadata"
    />
  );
}
