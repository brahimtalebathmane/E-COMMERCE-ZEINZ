"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toMetaPixelPurchaseMoney } from "@/lib/currency";
import {
  buildMetaPixelAdvancedMatching,
  metaPixelAmStorageKey,
  type MetaPixelAdvancedMatchingPayload,
} from "@/lib/meta-pixel-advanced-matching";
import { normalizeMetaPixelId } from "@/lib/meta-pixel-id";

declare global {
  interface Window {
    fbq?: FbqFn;
    _fbq?: FbqFn;
    __metaPixelInitialized?: Record<string, boolean>;
  }
}

type FbqFn = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  loaded?: boolean;
  version?: string;
};

let fbeventsLoadPromise: Promise<void> | null = null;

function isFbeventsSdkReady(): boolean {
  return typeof window !== "undefined" && typeof window.fbq?.callMethod === "function";
}

/** Load fbevents.js once; safe to call from every landing page / pixel id. */
function ensureFbeventsLoaded(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (isFbeventsSdkReady()) return Promise.resolve();
  if (fbeventsLoadPromise) return fbeventsLoadPromise;

  fbeventsLoadPromise = new Promise((resolve) => {
    if (isFbeventsSdkReady()) {
      resolve();
      return;
    }

    const n = function (this: FbqFn, ...args: unknown[]) {
      if (n.callMethod) {
        n.callMethod(...args);
      } else {
        n.queue.push(args);
      }
    } as FbqFn;

    n.queue = [];
    n.loaded = true;
    n.version = "2.0";
    window.fbq = n;
    window._fbq = n;

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    script.onload = () => resolve();
    script.onerror = () => {
      console.warn("[Meta Pixel] Failed to load fbevents.js — check ad blockers and CSP.");
      fbeventsLoadPromise = null;
      resolve();
    };
    const first = document.getElementsByTagName("script")[0];
    first?.parentNode?.insertBefore(script, first);
  });

  return fbeventsLoadPromise;
}

function callFbqWithRetry(
  fire: () => boolean,
  delaysMs = [0, 400, 1200, 2500],
): void {
  if (typeof window === "undefined") return;
  for (const delay of delaysMs) {
    window.setTimeout(() => {
      fire();
    }, delay);
  }
}

/** Digits-only pixel id for every fbq call (Meta rejects quoted strings). */
function fbqPixelId(raw: string): string {
  return normalizeMetaPixelId(raw) ?? raw.replace(/\D/g, "");
}

/**
 * Init each pixel ID at most once per session.
 * Does not call fbq('set','userData') — Meta rejects pixel_id when updating after init.
 */
async function ensurePixelInitialized(
  id: string,
  am?: MetaPixelAdvancedMatchingPayload,
): Promise<void> {
  const pixelId = fbqPixelId(id);
  if (!pixelId) return;

  await ensureFbeventsLoaded();
  if (typeof window === "undefined" || !window.fbq) return;

  window.__metaPixelInitialized = window.__metaPixelInitialized || {};
  if (window.__metaPixelInitialized[pixelId]) {
    return;
  }

  const hasAm = Boolean(am && Object.keys(am).length > 0);
  if (hasAm) {
    window.fbq("init", pixelId, am as Record<string, unknown>);
  } else {
    window.fbq("init", pixelId);
  }
  window.__metaPixelInitialized[pixelId] = true;
}

/** Load SDK + init pixel before trackSingle (required by Meta). */
async function ensurePixelReady(pixelId?: string | null): Promise<string | null> {
  const pid = pixelId ? fbqPixelId(pixelId) : null;
  await ensureFbeventsLoaded();
  if (pid) {
    await ensurePixelInitialized(pid);
  }
  return pid;
}

export type MetaPixelAdvancedMatchingProps = {
  phone?: string | null;
  customerName?: string | null;
};

type Props = {
  pixelId: string | null | undefined;
  advancedMatching?: MetaPixelAdvancedMatchingProps | null;
};

function mergeAdvancedMatchingForInit(
  fromStorage: MetaPixelAdvancedMatchingPayload | null,
  fromProps: MetaPixelAdvancedMatchingPayload | undefined,
): MetaPixelAdvancedMatchingPayload | undefined {
  const merged: MetaPixelAdvancedMatchingPayload = {
    ...(fromStorage ?? {}),
    ...(fromProps ?? {}),
  };
  const pruned: MetaPixelAdvancedMatchingPayload = {};
  if (merged.ph?.trim()) pruned.ph = merged.ph.trim();
  if (merged.fn?.trim()) pruned.fn = merged.fn.trim();
  if (merged.ln?.trim()) pruned.ln = merged.ln.trim();
  return Object.keys(pruned).length > 0 ? pruned : undefined;
}

/**
 * Persist advanced matching for the next landing init (sessionStorage).
 * CAPI still receives hashed phone/name from the order API.
 */
export function syncMetaPixelAdvancedMatching(
  pixelId: string | null | undefined,
  input: { phone: string; customerName: string },
) {
  const id = normalizeMetaPixelId(pixelId);
  if (!id || typeof window === "undefined") return;
  const am = buildMetaPixelAdvancedMatching(input);
  if (!am) return;
  try {
    sessionStorage.setItem(metaPixelAmStorageKey(id), JSON.stringify(am));
  } catch {
    // ignore
  }
}

export function MetaPixel({ pixelId, advancedMatching }: Props) {
  const [mounted, setMounted] = useState(false);
  const [storageAm, setStorageAm] = useState<MetaPixelAdvancedMatchingPayload | null>(
    null,
  );
  const lastPageViewPixelRef = useRef<string | null>(null);
  const missingPixelWarnedRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const id = normalizeMetaPixelId(pixelId);
    if (!id) {
      setStorageAm({});
      if (mounted && !missingPixelWarnedRef.current) {
        missingPixelWarnedRef.current = true;
        console.warn(
          "[Meta Pixel] No pixel ID — set meta_pixel_id on the product in Admin → Integrations, or NEXT_PUBLIC_META_PIXEL_ID in env.",
        );
      }
      return;
    }
    try {
      const raw = sessionStorage.getItem(metaPixelAmStorageKey(id));
      if (!raw) {
        setStorageAm({});
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        setStorageAm(parsed as MetaPixelAdvancedMatchingPayload);
      } else {
        setStorageAm({});
      }
    } catch {
      setStorageAm({});
    }
  }, [pixelId, mounted]);

  const propsAm = useMemo(() => {
    const phone = advancedMatching?.phone?.trim() ?? "";
    const customerName = advancedMatching?.customerName?.trim() ?? "";
    if (!phone && !customerName) return undefined;
    return buildMetaPixelAdvancedMatching({ phone, customerName });
  }, [advancedMatching?.phone, advancedMatching?.customerName]);

  const initAdvancedMatching = useMemo(
    () => mergeAdvancedMatchingForInit(storageAm, propsAm),
    [storageAm, propsAm],
  );

  const id = normalizeMetaPixelId(pixelId);
  const storageReady = storageAm !== null;

  useEffect(() => {
    if (!id || !mounted || !storageReady) return;

    let cancelled = false;

    const pixelIdForTrack = fbqPixelId(id);
    void ensurePixelInitialized(pixelIdForTrack, initAdvancedMatching).then(() => {
      if (cancelled || typeof window === "undefined" || !window.fbq) return;

      if (lastPageViewPixelRef.current !== pixelIdForTrack) {
        window.fbq("trackSingle", pixelIdForTrack, "PageView");
        lastPageViewPixelRef.current = pixelIdForTrack;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [id, mounted, storageReady, initAdvancedMatching]);

  if (!id || !mounted || !storageReady) return null;

  return (
    <noscript>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        height="1"
        width="1"
        style={{ display: "none" }}
        src={`https://www.facebook.com/tr?id=${encodeURIComponent(id)}&ev=PageView&noscript=1`}
        alt=""
      />
    </noscript>
  );
}

export function trackInitiateCheckout(eventId: string, pixelId?: string | null) {
  void ensurePixelReady(pixelId).then((pid) => {
    callFbqWithRetry(() => {
      if (!window.fbq) return false;
      if (pid) {
        window.fbq("trackSingle", pid, "InitiateCheckout", {}, { eventID: eventId });
      } else {
        window.fbq("track", "InitiateCheckout", {}, { eventID: eventId });
      }
      return true;
    });
  });
}

/** Purchase Pixel payload matches CAPI: MRU order total converted to USD. */
export function trackPurchase(params: {
  eventId: string;
  valueMru: number;
  currency?: string;
}) {
  if (typeof window === "undefined" || !window.fbq) return;
  const { value, currency } = toMetaPixelPurchaseMoney(
    params.valueMru,
    params.currency ?? "MRU",
  );
  window.fbq(
    "track",
    "Purchase",
    { value, currency },
    { eventID: params.eventId },
  );
}

export function trackLead(params: {
  value: number;
  currency: string;
  eventId: string;
  pixelId?: string | null;
}) {
  const { value, currency } = toMetaPixelPurchaseMoney(params.value, params.currency);
  void ensurePixelReady(params.pixelId).then((pid) => {
    callFbqWithRetry(() => {
      if (!window.fbq) return false;
      const payload = { value, currency };
      const opts = { eventID: params.eventId };
      if (pid) {
        window.fbq("trackSingle", pid, "Lead", payload, opts);
      } else {
        window.fbq("track", "Lead", payload, opts);
      }
      return true;
    });
  });
}
