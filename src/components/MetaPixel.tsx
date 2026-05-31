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

/** Load fbevents.js once; safe to call from every landing page / pixel id. */
function ensureFbeventsLoaded(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.fbq?.loaded) return Promise.resolve();
  if (fbeventsLoadPromise) return fbeventsLoadPromise;

  fbeventsLoadPromise = new Promise((resolve) => {
    if (window.fbq) {
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
    script.onerror = () => resolve();
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

/**
 * Init each pixel ID at most once per session.
 * Further user-data updates use fbq('set','userData') scoped with pixelID (no second init).
 */
async function ensurePixelInitialized(
  id: string,
  am?: MetaPixelAdvancedMatchingPayload,
): Promise<void> {
  await ensureFbeventsLoaded();
  if (typeof window === "undefined" || !window.fbq) return;

  window.__metaPixelInitialized = window.__metaPixelInitialized || {};
  const hasAm = Boolean(am && Object.keys(am).length > 0);

  if (window.__metaPixelInitialized[id]) {
    if (hasAm) {
      window.fbq("set", "userData", am as Record<string, unknown>, { pixelID: id });
    }
    return;
  }

  if (hasAm) {
    window.fbq("init", id, am as Record<string, unknown>);
  } else {
    window.fbq("init", id);
  }
  window.__metaPixelInitialized[id] = true;
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
 * Apply Advanced Matching after init (e.g. right before Lead) so events include user data.
 */
export function syncMetaPixelAdvancedMatching(
  pixelId: string | null | undefined,
  input: { phone: string; customerName: string },
) {
  const id = normalizeMetaPixelId(pixelId);
  if (!id || typeof window === "undefined") return;
  const am = buildMetaPixelAdvancedMatching(input);
  if (!am) return;
  void ensurePixelInitialized(id, am);
}

export function MetaPixel({ pixelId, advancedMatching }: Props) {
  const [mounted, setMounted] = useState(false);
  const [storageAm, setStorageAm] = useState<MetaPixelAdvancedMatchingPayload | null>(
    null,
  );
  const lastPageViewPixelRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const id = normalizeMetaPixelId(pixelId);
    if (!id) {
      setStorageAm({});
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
  }, [pixelId]);

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

    void ensurePixelInitialized(id, initAdvancedMatching).then(() => {
      if (cancelled || typeof window === "undefined" || !window.fbq) return;

      if (lastPageViewPixelRef.current !== id) {
        window.fbq("track", "PageView");
        lastPageViewPixelRef.current = id;
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

export function trackInitiateCheckout(eventId: string) {
  callFbqWithRetry(() => {
    if (!window.fbq) return false;
    window.fbq("track", "InitiateCheckout", {}, { eventID: eventId });
    return true;
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
}) {
  const { value, currency } = toMetaPixelPurchaseMoney(params.value, params.currency);
  callFbqWithRetry(() => {
    if (!window.fbq) return false;
    window.fbq(
      "track",
      "Lead",
      {
        value,
        currency,
      },
      { eventID: params.eventId },
    );
    return true;
  });
}
