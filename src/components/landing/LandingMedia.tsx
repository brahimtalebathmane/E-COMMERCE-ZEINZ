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
  type SyntheticEvent,
} from "react";
import type MuxPlayerElement from "@mux/mux-player";
import type { ProductRow } from "@/types";
import { LANDING_HERO_IMAGE } from "@/lib/landing-hero-image";
import { getLocalizedProductCopy } from "@/lib/product-locale";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  isCloudflareStreamEmbedUrl,
  isCloudflareStreamHlsUrl,
  isHlsUrl,
  isMuxHostedUrl,
  muxPlaybackIdFromUrl,
} from "@/lib/video-media-url";
import { reportMediaFailure } from "@/lib/media-failure-report";

/** Theme + player load together only when a landing renders video (image-only pages skip this chunk). */
const MuxPlayer = dynamic(
  () =>
    Promise.all([
      import("@mux/mux-player/themes/classic"),
      import("@mux/mux-player-react"),
    ]).then(([, mod]) => mod.default),
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

function muxPosterUrl(playbackId: string): string {
  /* Smaller default poster for faster LCP on mobile networks */
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=0&width=720&fit_mode=preserve`;
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
  product?: ProductRow;
  mediaType?: "image" | "video";
  mediaUrl?: string;
  mediaName?: string;
  priority?: boolean;
  /** Full viewport width on the landing page; uses cover + 100vw sizing for photos */
  edgeToEdge?: boolean;
  /** Gallery blocks only: wider cinematic framing, full band layout — not used for the hero product image */
  immersive?: boolean;
  /**
   * Hero product media — rendered in a fixed 16:9 frame with object-cover,
   * matching secondary/tertiary landing media.
   */
  primaryHero?: boolean;
  /** Product slug, for a broken-image failure report. Falls back to `product?.slug` when `product` is passed directly (hero). */
  productSlug?: string;
  /** Which landing slot this instance renders — used only for failure reporting. */
  slot?: "hero" | "secondary" | "tertiary";
};

function muxPlayerOpts(priority: boolean | undefined) {
  return {
    theme: "classic" as const,
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

/** Neutral placeholder — shown for an empty URL and reused for a failed image load, so a broken image never renders as a raw broken-icon. */
function MediaPlaceholder() {
  return (
    <div className="flex aspect-video w-full min-h-[12rem] items-center justify-center bg-[var(--accent-muted)] text-sm text-[var(--muted)]">
      —
    </div>
  );
}

export function LandingMedia({
  product,
  mediaType,
  mediaUrl,
  mediaName,
  priority,
  edgeToEdge,
  immersive,
  primaryHero,
  productSlug,
  slot,
}: Props) {
  const { locale } = useLanguage();
  const displayName = useMemo(
    () => {
      if (mediaName) return mediaName;
      if (product) return getLocalizedProductCopy(locale, product).name;
      return "";
    },
    [locale, mediaName, product],
  );
  const url = (mediaUrl ?? product?.media_url ?? "").trim();
  const [muxAspect, setMuxAspect] = useState("16 / 9");
  const [nativeAspect, setNativeAspect] = useState("16 / 9");
  const [imageFailed, setImageFailed] = useState(false);
  const reportedFailureUrlRef = useRef<string | null>(null);
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
    setImageFailed(false);
  }, [url]);

  const handleImageError = useCallback(() => {
    setImageFailed(true);
    if (reportedFailureUrlRef.current === url) return;
    reportedFailureUrlRef.current = url;
    const slugForReport = (productSlug ?? product?.slug ?? "").trim();
    if (slugForReport) {
      reportMediaFailure({ slug: slugForReport, slot: slot ?? "hero", url });
    }
  }, [url, productSlug, product, slot]);

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
    return <MediaPlaceholder />;
  }

  const muxPlaybackId = muxPlaybackIdFromUrl(url);
  const treatAsImage =
    (mediaType ?? product?.media_type ?? "image") === "image" &&
    !isHlsUrl(url) &&
    !muxPlaybackId;

  if (treatAsImage && primaryHero) {
    if (imageFailed) return <MediaPlaceholder />;
    return (
      <div className="relative mx-auto aspect-video w-full min-w-0 overflow-hidden bg-[var(--accent-muted)]">
        <Image
          src={url}
          alt={displayName}
          fill
          sizes={LANDING_HERO_IMAGE.sizes}
          quality={LANDING_HERO_IMAGE.quality}
          className="object-cover object-center"
          style={{ objectPosition: "center center" }}
          priority={priority}
          fetchPriority={priority ? "high" : "auto"}
          onError={handleImageError}
        />
      </div>
    );
  }

  if (treatAsImage) {
    if (imageFailed) return <MediaPlaceholder />;
    const imgSizes = edgeToEdge || immersive ? "100vw" : "(max-width: 640px) 100vw, min(90vw, 1280px)";
    return (
      <div className="relative mx-auto aspect-video w-full min-w-0 overflow-hidden bg-[var(--accent-muted)]">
        <Image
          src={url}
          alt={displayName}
          fill
          className="object-cover object-center"
          style={{ objectPosition: "center center" }}
          sizes={imgSizes}
          priority={priority}
          fetchPriority={priority ? "high" : "auto"}
          quality={immersive ? 88 : 85}
          onError={handleImageError}
        />
      </div>
    );
  }

  if (isCloudflareStreamEmbedUrl(url)) {
    const iframeSrc = cloudflareStreamIframeSrcWithAutoplay(url, !cloudflareSound);
    return (
      <div
        className="landing-mux-shell relative min-h-0 min-w-0 bg-black"
        data-landing-immersive={immersive ? "" : undefined}
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
    isHlsUrl(url) ||
    isMuxHostedUrl(url) ||
    isCloudflareStreamHlsUrl(url)
  ) {
    const placeholder = muxPlaybackId ? muxPosterUrl(muxPlaybackId) : undefined;
    return (
      <div
        className="landing-mux-shell relative min-h-0 min-w-0 overflow-hidden bg-black"
        style={
          {
            "--ar-w": immersive || primaryHero ? 16 : muxParts.w,
            "--ar-h": immersive || primaryHero ? 9 : muxParts.h,
          } as CSSProperties
        }
        data-landing-immersive={immersive ? "" : undefined}
        data-landing-portrait={
          immersive || primaryHero ? undefined : muxParts.h > muxParts.w ? "" : undefined
        }
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
        className="landing-native-shell relative w-full bg-black"
        style={
          {
            "--ar-w": immersive || primaryHero ? 16 : nativeParts.w,
            "--ar-h": immersive || primaryHero ? 9 : nativeParts.h,
          } as CSSProperties
        }
        data-landing-immersive={immersive ? "" : undefined}
        data-landing-portrait={
          immersive || primaryHero ? undefined : nativeParts.h > nativeParts.w ? "" : undefined
        }
      >
        <video
          ref={nativeVideoRef}
          className="absolute inset-0 h-full w-full bg-black object-cover"
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
