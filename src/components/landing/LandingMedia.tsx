"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type MuxPlayerElement from "@mux/mux-player";
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

const DEFAULT_ASPECT = { w: 16, h: 9 };

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

/** Merge Stream iframe query params for muted autoplay (browser autoplay policies). */
function cloudflareStreamIframeSrcWithAutoplay(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("autoplay", "true");
    u.searchParams.set("muted", "true");
    u.searchParams.set("preload", "auto");
    return u.toString();
  } catch {
    return url;
  }
}

/** Video UID for thumbnail / API paths (iframe or customer stream host). */
function cloudflareStreamVideoUidFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "iframe.videodelivery.net") {
      const first = u.pathname.split("/").filter(Boolean)[0];
      return first ?? null;
    }
    if (/\.cloudflarestream\.com$/i.test(u.hostname)) {
      const parts = u.pathname.split("/").filter(Boolean);
      const iframeIdx = parts.findIndex((p) => p.toLowerCase() === "iframe");
      if (iframeIdx > 0) return parts[iframeIdx - 1] ?? null;
      if (parts.length >= 1) return parts[0] ?? null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Responsive box that preserves source aspect ratio (no stretching).
 * Portrait: prioritize full-height visibility within a tall cap; landscape: wide hero cap.
 */
function adaptiveVideoContainerStyle(aspect: { w: number; h: number }): CSSProperties {
  const { w, h } = aspect;
  if (w <= 0 || h <= 0) {
    return { aspectRatio: `${DEFAULT_ASPECT.w} / ${DEFAULT_ASPECT.h}`, maxWidth: "100%" };
  }
  const portrait = h > w;
  const maxMain = portrait ? "min(92vh, 56rem)" : "min(85vh, 56rem)";
  return {
    aspectRatio: `${w} / ${h}`,
    maxHeight: maxMain,
    maxWidth: "100%",
    width: `min(100%, calc(${maxMain} * ${w} / ${h}))`,
    marginLeft: "auto",
    marginRight: "auto",
  };
}

type Props = {
  product: ProductRow;
  priority?: boolean;
};

const muxPlayerCommon = {
  streamType: "on-demand" as const,
  accentColor: "#00ff00",
  playsInline: true,
  preload: "auto" as const,
  capRenditionToPlayerSize: true,
  autoPlay: true,
  muted: true,
};

const muxPlayerLayoutClass =
  "absolute inset-0 block h-full w-full max-h-full max-w-full";

export function LandingMedia({ product, priority }: Props) {
  const url = product.media_url?.trim() ?? "";
  const [aspectDims, setAspectDims] = useState(DEFAULT_ASPECT);
  const [nativeDims, setNativeDims] = useState<{ w: number; h: number } | null>(null);
  const [cfDims, setCfDims] = useState<{ w: number; h: number } | null>(null);
  const nativeVideoRef = useRef<HTMLVideoElement | null>(null);

  const resetAspectState = useCallback(() => {
    setAspectDims(DEFAULT_ASPECT);
    setNativeDims(null);
    setCfDims(null);
  }, []);

  useEffect(() => {
    resetAspectState();
  }, [url, resetAspectState]);

  useEffect(() => {
    const v = nativeVideoRef.current;
    if (!v) return;
    v.muted = true;
    const attempt = v.play();
    if (attempt !== undefined) {
      attempt.catch(() => {
        /* Autoplay blocked; user can use controls */
      });
    }
  }, [url]);

  /** Cloudflare iframe: derive aspect from public thumbnail (matches video frame). */
  useEffect(() => {
    if (!url || !isCloudflareStreamEmbedUrl(url)) {
      return;
    }
    const uid = cloudflareStreamVideoUidFromUrl(url);
    if (!uid) return;
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (cancelled) return;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setCfDims({ w: img.naturalWidth, h: img.naturalHeight });
      }
    };
    img.onerror = () => {
      /* keep default 16:9 */
    };
    img.src = `https://videodelivery.net/${uid}/thumbnails/thumbnail.jpg?width=1280`;
    return () => {
      cancelled = true;
    };
  }, [url]);

  const handleMuxLoadedMetadata = useCallback((e: Event) => {
    const el = e.currentTarget as MuxPlayerElement;
    if (el.videoWidth > 0 && el.videoHeight > 0) {
      setAspectDims({ w: el.videoWidth, h: el.videoHeight });
    }
  }, []);

  const handleNativeLoadedMetadata = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const el = e.currentTarget;
      if (el.videoWidth > 0 && el.videoHeight > 0) {
        setNativeDims({ w: el.videoWidth, h: el.videoHeight });
      }
    },
    [],
  );

  const muxBoxStyle = useMemo(
    () => adaptiveVideoContainerStyle(aspectDims),
    [aspectDims],
  );

  const cfBoxStyle = useMemo(
    () => adaptiveVideoContainerStyle(cfDims ?? DEFAULT_ASPECT),
    [cfDims],
  );

  const nativeBoxStyle = useMemo(
    () => adaptiveVideoContainerStyle(nativeDims ?? DEFAULT_ASPECT),
    [nativeDims],
  );

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
    const iframeSrc = cloudflareStreamIframeSrcWithAutoplay(url);
    return (
      <div
        className="relative min-h-0 min-w-0 overflow-hidden bg-black"
        style={cfBoxStyle}
      >
        <iframe
          src={iframeSrc}
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
      <div
        className="relative min-h-0 min-w-0 overflow-hidden bg-black"
        style={muxBoxStyle}
      >
        {muxPlaybackId ? (
          <MuxPlayer
            playbackId={muxPlaybackId}
            {...muxPlayerCommon}
            placeholder={placeholder}
            poster={placeholder}
            metadataVideoTitle={product.name}
            className={muxPlayerLayoutClass}
            style={{ width: "100%", height: "100%" }}
            onLoadedMetadata={handleMuxLoadedMetadata}
          />
        ) : (
          <MuxPlayer
            src={url}
            {...muxPlayerCommon}
            metadataVideoTitle={product.name}
            className={muxPlayerLayoutClass}
            style={{ width: "100%", height: "100%" }}
            onLoadedMetadata={handleMuxLoadedMetadata}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full justify-center bg-black">
      <div
        className="relative min-h-0 min-w-0 overflow-hidden bg-black"
        style={nativeBoxStyle}
      >
        <video
          ref={nativeVideoRef}
          className="absolute inset-0 h-full w-full object-contain"
          src={url}
          controls
          playsInline
          muted
          autoPlay
          preload="auto"
          onLoadedMetadata={handleNativeLoadedMetadata}
          {...(priority ? { fetchPriority: "high" as const } : {})}
        />
      </div>
    </div>
  );
}
