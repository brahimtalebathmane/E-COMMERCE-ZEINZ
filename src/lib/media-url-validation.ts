import "server-only";

import { isVideoMediaUrl } from "@/lib/video-media-url";

const HEAD_PROBE_TIMEOUT_MS = 4000;

/**
 * Host/path shapes that return an HTML share/viewer page instead of raw
 * image bytes — a Next/Image `src` (or a plain `<img>`) pointing at one of
 * these always breaks, so they're rejected before ever reaching the HEAD
 * probe below. Keep this list in one place and extend it as new bad-link
 * patterns show up in the audit (`npm run audit:media-urls`) or admin
 * reports.
 */
const BLOCKED_MEDIA_URL_PATTERNS: Array<{ label: string; test: (u: URL) => boolean }> = [
  {
    label: "رابط مشاركة Google Drive",
    test: (u) => /(^|\.)drive\.google\.com$/i.test(u.hostname) && u.pathname.includes("/file/d/"),
  },
  {
    label: "رابط مشاركة Google Photos",
    test: (u) =>
      u.hostname === "photos.app.goo.gl" ||
      (u.hostname === "photos.google.com" && u.pathname.startsWith("/share")),
  },
  {
    label: "صفحة مشاركة Dropbox (?dl=0)",
    test: (u) => /(^|\.)dropbox\.com$/i.test(u.hostname) && u.searchParams.get("dl") === "0",
  },
  {
    label: "صفحة Facebook",
    test: (u) => /(^|\.)facebook\.com$/i.test(u.hostname),
  },
  {
    label: "صفحة Instagram",
    test: (u) => /(^|\.)instagram\.com$/i.test(u.hostname),
  },
  {
    label: "صفحة نتائج بحث/عرض صور Google",
    test: (u) =>
      /(^|\.)google\.[a-z.]+$/i.test(u.hostname) &&
      (u.pathname.startsWith("/imgres") || u.pathname.startsWith("/search")),
  },
  {
    label: "صفحة Pinterest",
    test: (u) => /(^|\.)pinterest\.[a-z.]+$/i.test(u.hostname),
  },
];

type ProbeResult =
  | { kind: "ok" }
  | { kind: "bad_status"; status: number }
  | { kind: "bad_content_type"; contentType: string }
  | { kind: "network_error"; message: string };

async function probeImageContentType(url: string, timeoutMs: number): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "HEAD", signal: controller.signal, redirect: "follow" });
    if (!res.ok) return { kind: "bad_status", status: res.status };
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return { kind: "bad_content_type", contentType: contentType || "(missing)" };
    }
    return { kind: "ok" };
  } catch (error) {
    return {
      kind: "network_error",
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

export type MediaUrlValidation =
  | { ok: true; warning?: string }
  | { ok: false; error: string };

/**
 * Validates one media URL before it's allowed to reach the DB:
 * 1. Must parse as a URL and use https.
 * 2. Must not be a known non-direct link shape (share page, search page…).
 * 3. If not a recognised video URL (Mux/HLS/Cloudflare Stream — see
 *    video-media-url.ts), a HEAD probe must confirm 2xx + `image/*`.
 * A HEAD probe that fails to even complete (DNS timeout, etc.) warns
 * instead of blocking — a flaky network call in a build environment must
 * never make an otherwise-valid product unsaveable.
 */
export async function validateMediaUrl(rawUrl: string): Promise<MediaUrlValidation> {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { ok: true };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: `الرابط "${trimmed}" غير صالح.` };
  }

  if (parsed.protocol !== "https:") {
    return {
      ok: false,
      error: `الرابط "${trimmed}" يستخدم http وليس https — المتجر لا يمكنه تحميل صور غير آمنة (http). استخدم رابطاً يبدأ بـ https، أو ارفع الصورة مباشرة.`,
    };
  }

  const blocked = BLOCKED_MEDIA_URL_PATTERNS.find((p) => p.test(parsed));
  if (blocked) {
    return {
      ok: false,
      error: `هذا الرابط من نوع "${blocked.label}" ولا يشير مباشرة إلى ملف صورة — هذه الصفحات لا تعمل كرابط صورة مباشر. ارفع الصورة مباشرة بدلاً من ذلك.`,
    };
  }

  if (isVideoMediaUrl(trimmed)) {
    return { ok: true };
  }

  const probe = await probeImageContentType(trimmed, HEAD_PROBE_TIMEOUT_MS);
  if (probe.kind === "ok") return { ok: true };
  if (probe.kind === "bad_status") {
    return {
      ok: false,
      error: `تعذّر تحميل الرابط "${trimmed}": الخادم أعاد الحالة ${probe.status}. تأكد أن الرابط يشير مباشرة إلى الصورة وأنه لا يزال متاحاً.`,
    };
  }
  if (probe.kind === "bad_content_type") {
    return {
      ok: false,
      error: `الرابط "${trimmed}" لا يشير إلى ملف صورة (نوع المحتوى: ${probe.contentType}). ارفع الصورة مباشرة أو استخدم رابطاً مباشراً لملف الصورة.`,
    };
  }
  return {
    ok: true,
    warning: `تعذّر التحقق من الرابط "${trimmed}" بسبب خطأ في الشبكة أثناء الحفظ (${probe.message}) — تم الحفظ، لكن يُفضّل فتح الرابط يدوياً للتأكد أنه يعمل.`,
  };
}

export type MediaUrlFieldEntry = { field: string; url: string };

export type MediaUrlBatchValidation =
  | { ok: true; warnings: string[] }
  | { ok: false; error: string };

/** Validates every media URL field for a product save in sequence, stopping at the first hard failure. */
export async function validateProductMediaUrls(
  entries: MediaUrlFieldEntry[],
): Promise<MediaUrlBatchValidation> {
  const warnings: string[] = [];
  for (const entry of entries) {
    if (!entry.url.trim()) continue;
    const result = await validateMediaUrl(entry.url);
    if (!result.ok) {
      return { ok: false, error: `${entry.field}: ${result.error}` };
    }
    if (result.warning) {
      warnings.push(`${entry.field}: ${result.warning}`);
    }
  }
  return { ok: true, warnings };
}
