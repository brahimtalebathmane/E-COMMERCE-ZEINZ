"use client";

import Image from "next/image";
import {
  catalogVideoPosterUrl,
  isDirectVideoFileUrl,
} from "@/lib/catalog-media";

type Props = {
  mediaType: "image" | "video";
  mediaUrl: string;
  alt: string;
  priority?: boolean;
};

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 5v14l11-7L8 5z" />
    </svg>
  );
}

export function CatalogProductMedia({
  mediaType,
  mediaUrl,
  alt,
  priority = false,
}: Props) {
  const url = mediaUrl.trim();
  const poster = mediaType === "video" ? catalogVideoPosterUrl(url) : null;
  const showVideoFile = mediaType === "video" && !poster && isDirectVideoFileUrl(url);

  if (!url) {
    return (
      <div
        className="flex h-full min-h-[10rem] w-full items-center justify-center bg-[var(--accent-muted)]/40 text-[var(--muted)]"
        aria-hidden
      >
        <PlayIcon className="h-12 w-12 opacity-40" />
      </div>
    );
  }

  if (mediaType === "image") {
    return (
      <Image
        src={url}
        alt={alt}
        fill
        priority={priority}
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        className="object-cover transition duration-200 group-hover:scale-[1.02]"
      />
    );
  }

  if (poster) {
    return (
      <div className="relative h-full w-full">
        <Image
          src={poster}
          alt={alt}
          fill
          priority={priority}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition duration-200 group-hover:scale-[1.02]"
        />
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25 transition duration-200 group-hover:bg-black/35"
          aria-hidden
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-[var(--accent)] shadow-lg ring-2 ring-white/40">
            <PlayIcon className="ms-0.5 h-7 w-7" />
          </span>
        </div>
      </div>
    );
  }

  if (showVideoFile) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-black">
        <video
          src={url}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
          aria-label={alt}
        />
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20"
          aria-hidden
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-[var(--accent)] shadow-lg ring-2 ring-white/40">
            <PlayIcon className="ms-0.5 h-7 w-7" />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-[10rem] w-full items-center justify-center bg-gradient-to-br from-[var(--accent-muted)]/80 to-[var(--accent-muted)]/30 text-[var(--accent)]">
      <PlayIcon className="h-14 w-14 opacity-90 drop-shadow" />
      <span className="sr-only">{alt}</span>
    </div>
  );
}
