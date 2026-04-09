"use client";

import "@mux/mux-player/themes/classic";
import Image from "next/image";
import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type SyntheticEvent,
} from "react";
import type MuxPlayerElement from "@mux/mux-player";
import type { ProductRow } from "@/types";
import { getLocalizedProductCopy } from "@/lib/product-locale";
import { useLanguage } from "@/contexts/LanguageContext";

const MuxPlayer = dynamic(
  () => import("@mux/mux-player-react/lazy").then((mod) => mod.default),
  {
    ssr: false,
    loading: () => (
      <div
        className="landing-mux-shell flex min-h-[12rem] items-center justify-center text-sm text-white/60"
        style={{ "--ar-w": 16, "--ar-h": 9 } as CSSProperties}
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
  /* Smaller default poster for faster LCP on mobile networks */
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=0&width=720&fit_mode=preserve`;
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
function cloudflareStreamIframeSrcWithAutoplay(url: string, muted: boolean): string {
  try {
    const u = new URL(url);
    u.searchParams.set("autoplay", "true");
    u.searchParams.set("muted", muted ? "true" : "false");
    u.searchParams.set("preload", "auto");
    u.searchParams.set("playsinline", "true");
    return u.toString();
  } catch {
    return url;
  }
}

function parseAspectParts(aspectStr: string): { w: number; h: number } | null {
  const parts = aspectStr.split("/").map((s) => Number(s.trim()));
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { w: parts[0], h: parts[1] };
}

type Props = {
  product: ProductRow;
  priority?: boolean;
};

function muxPlayerOpts(priority: boolean | undefined) {
  return {
    streamType: "on-demand" as const,
    accentColor: "#00ff00",
    playsInline: true,
    preload: (priority ? "auto" : "metadata") as "auto" | "metadata",
    capRenditionToPlayerSize: true,
    autoPlay: !!priority,
    muted: false,
  };
}

const muxPlayerLayoutClass =
  "absolute inset-0 block h-full w-full max-h-full max-w-full";

export function LandingMedia({ product, priority }: Props) {
  const { locale } = useLanguage();
  const displayName = useMemo(
    () => getLocalizedProductCopy(locale, product).name,
    [locale, product],
  );
  const url = product.media_url?.trim() ?? "";
  const [muxAspect, setMuxAspect] = useState("16 / 9");
  const [nativeAspect, setNativeAspect] = useState("16 / 9");
  const muxRef = useRef<MuxPlayerElement | null>(null);
  const nativeVideoRef = useRef<HTMLVideoElement | null>(null);
  const [needsTapForSound, setNeedsTapForSound] = useState(false);
  const [cloudflareSound, setCloudflareSound] = useState(false);

  const muxParts = useMemo(
    () => parseAspectParts(muxAspect) ?? { w: 16, h: 9 },
    [muxAspect],
  );
  const nativeParts = useMemo(
    () => parseAspectParts(nativeAspect) ?? { w: 16, h: 9 },
    [nativeAspect],
  );

  useEffect(() => {
    setMuxAspect("16 / 9");
    setNativeAspect("16 / 9");
  }, [url]);

  useEffect(() => {
    const el = muxRef.current;
    if (!el || !priority) return;
    const kick = () => {
      try {
        el.muted = false;
        const p = el.play?.();
        if (p && typeof (p as Promise<void>).catch === "function") {
          (p as Promise<void>).catch(() => {
            try {
              el.muted = true;
              setNeedsTapForSound(true);
              void el.play?.().catch(() => {});
            } catch {
              setNeedsTapForSound(true);
            }
          });
        }
      } catch {
        setNeedsTapForSound(true);
      }
    };
    kick();
    el.addEventListener("loadeddata", kick);
    el.addEventListener("canplay", kick);
    return () => {
      el.removeEventListener("loadeddata", kick);
      el.removeEventListener("canplay", kick);
    };
  }, [url, priority]);

  useEffect(() => {
    const v = nativeVideoRef.current;
    if (!v) return;
    v.muted = false;
    v.defaultMuted = false;
    v.setAttribute("playsinline", "");
    if (!priority) return;
    const attempt = v.play();
    if (attempt !== undefined) {
      attempt.catch(() => {
        try {
          v.muted = true;
          v.defaultMuted = true;
          setNeedsTapForSound(true);
          void v.play().catch(() => {});
        } catch {
          setNeedsTapForSound(true);
        }
      });
    }
  }, [url, priority]);

  const handleMuxLoadedMetadata = useCallback((e: Event) => {
    const el = e.currentTarget as MuxPlayerElement;
    if (el.videoWidth > 0 && el.videoHeight > 0) {
      setMuxAspect(`${el.videoWidth} / ${el.videoHeight}`);
    }
  }, []);

  const handleNativeLoadedMetadata = useCallback(
    (e: SyntheticEvent<HTMLVideoElement>) => {
      const v = e.currentTarget;
      if (v.videoWidth > 0 && v.videoHeight > 0) {
        setNativeAspect(`${v.videoWidth} / ${v.videoHeight}`);
      }
      v.muted = false;
      v.defaultMuted = false;
      if (priority) {
        void v.play().catch(() => {
          v.muted = true;
          v.defaultMuted = true;
          setNeedsTapForSound(true);
          void v.play().catch(() => {});
        });
      }
    },
    [priority],
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
          alt={displayName}
          fill
          className="object-contain sm:object-cover"
          sizes="(max-width: 640px) 100vw, min(90vw, 1280px)"
          priority={priority}
          fetchPriority={priority ? "high" : "auto"}
          quality={85}
        />
      </div>
    );
  }

  if (isCloudflareStreamEmbedUrl(url)) {
    const iframeSrc = cloudflareStreamIframeSrcWithAutoplay(url, !cloudflareSound);
    return (
      <div
        className="landing-mux-shell relative min-h-0 min-w-0 bg-black"
        style={
          {
            "--ar-w": 16,
            "--ar-h": 9,
          } as CSSProperties
        }
      >
        <iframe
          src={iframeSrc}
          title={displayName}
          className="absolute inset-0 h-full w-full border-0"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          loading={priority ? "eager" : "lazy"}
          referrerPolicy="strict-origin-when-cross-origin"
        />
        {!cloudflareSound ? (
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-3 sm:p-4">
            <button
              type="button"
              className="pointer-events-auto rounded-xl bg-black/60 px-4 py-2 text-sm font-semibold text-white backdrop-blur"
              onClick={() => setCloudflareSound(true)}
            >
              {locale === "fr" ? "Activer le son" : "تشغيل الصوت"}
            </button>
          </div>
        ) : null}
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
        className="landing-mux-shell relative min-h-0 min-w-0 overflow-hidden bg-black"
        style={
          {
            "--ar-w": muxParts.w,
            "--ar-h": muxParts.h,
          } as CSSProperties
        }
        data-landing-portrait={muxParts.h > muxParts.w ? "" : undefined}
      >
        {muxPlaybackId ? (
          <MuxPlayer
            ref={muxRef}
            playbackId={muxPlaybackId}
            {...muxPlayerOpts(priority)}
            placeholder={placeholder}
            poster={placeholder}
            metadataVideoTitle={displayName}
            className={muxPlayerLayoutClass}
            style={{ width: "100%", height: "100%" }}
            onLoadedMetadata={handleMuxLoadedMetadata}
          />
        ) : (
          <MuxPlayer
            ref={muxRef}
            src={url}
            {...muxPlayerOpts(priority)}
            metadataVideoTitle={displayName}
            className={muxPlayerLayoutClass}
            style={{ width: "100%", height: "100%" }}
            onLoadedMetadata={handleMuxLoadedMetadata}
          />
        )}
        {needsTapForSound ? (
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-3 sm:p-4">
            <button
              type="button"
              className="pointer-events-auto rounded-xl bg-black/60 px-4 py-2 text-sm font-semibold text-white backdrop-blur"
              onClick={() => {
                const el = muxRef.current;
                if (!el) return;
                setNeedsTapForSound(false);
                try {
                  el.muted = false;
                  void el.play?.().catch(() => {});
                } catch {
                  /* ignore */
                }
              }}
            >
              {locale === "fr" ? "Appuyez pour activer le son" : "اضغط لتشغيل الصوت"}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative w-full bg-black">
      <div
        className="landing-native-shell w-full bg-black"
        style={
          {
            "--ar-w": nativeParts.w,
            "--ar-h": nativeParts.h,
          } as CSSProperties
        }
        data-landing-portrait={nativeParts.h > nativeParts.w ? "" : undefined}
      >
        <video
          ref={nativeVideoRef}
          className="mx-auto block bg-black sm:h-auto sm:w-full sm:max-h-[min(85vh,56rem)] sm:max-w-full"
          src={url}
          controls
          playsInline
          autoPlay={!!priority}
          preload={priority ? "auto" : "metadata"}
          onLoadedMetadata={handleNativeLoadedMetadata}
          {...(priority ? { fetchPriority: "high" as const } : {})}
        />
      </div>
      {needsTapForSound ? (
        <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-3 sm:p-4">
          <button
            type="button"
            className="pointer-events-auto rounded-xl bg-black/60 px-4 py-2 text-sm font-semibold text-white backdrop-blur"
            onClick={() => {
              const v = nativeVideoRef.current;
              if (!v) return;
              setNeedsTapForSound(false);
              v.muted = false;
              v.defaultMuted = false;
              void v.play().catch(() => {});
            }}
          >
            {locale === "fr" ? "Appuyez pour activer le son" : "اضغط لتشغيل الصوت"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
