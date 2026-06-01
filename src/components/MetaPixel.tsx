"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toMetaPixelPurchaseMoney } from "@/lib/currency";
import {
  buildMetaPixelAdvancedMatching,
  metaPixelAmStorageKey,
  type MetaPixelAdvancedMatchingPayload,
} from "@/lib/meta-pixel-advanced-matching";
import { normalizeMetaPixelId, resolvePublicMetaPixelId } from "@/lib/meta-pixel-id";

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

const FBEVENTS_SRC = "https://connect.facebook.net/en_US/fbevents.js";
const SDK_WAIT_MS = 8_000;
const LOAD_TIMEOUT_MS = 10_000;

let fbeventsLoadPromise: Promise<void> | null = null;

function isFbeventsSdkReady(): boolean {
  return typeof window !== "undefined" && typeof window.fbq?.callMethod === "function";
}

function waitForFbeventsSdk(maxMs = SDK_WAIT_MS): Promise<void> {
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (isFbeventsSdkReady() || Date.now() - start >= maxMs) {
        resolve();
        return;
      }
      window.setTimeout(tick, 50);
    };
    tick();
  });
}

function injectFbeventsScript(script: HTMLScriptElement): void {
  const first = document.getElementsByTagName("script")[0];
  if (first?.parentNode) {
    first.parentNode.insertBefore(script, first);
    return;
  }
  document.head.appendChild(script);
}

/** Load fbevents.js once (Meta standard stub + script inject). Always resolves (never hangs). */
function ensureFbeventsLoaded(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (isFbeventsSdkReady()) return Promise.resolve();
  if (fbeventsLoadPromise) return fbeventsLoadPromise;

  fbeventsLoadPromise = new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    window.setTimeout(finish, LOAD_TIMEOUT_MS);

    if (isFbeventsSdkReady()) {
      finish();
      return;
    }

    if (!window.fbq) {
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
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src*="connect.facebook.net"][src*="fbevents.js"]`,
    );
    if (existing) {
      void waitForFbeventsSdk().then(finish);
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = FBEVENTS_SRC;
    script.onload = () => {
      void waitForFbeventsSdk().then(finish);
    };
    script.onerror = () => {
      console.warn("[Meta Pixel] Failed to load fbevents.js — check ad blockers and CSP.");
      fbeventsLoadPromise = null;
      finish();
    };
    injectFbeventsScript(script);
  });

  return fbeventsLoadPromise;
}

/** Wait until Meta SDK is callable (or timeout). */
async function waitForPixelSdk(): Promise<boolean> {
  await ensureFbeventsLoaded();
  if (isFbeventsSdkReady()) return true;
  await waitForFbeventsSdk();
  if (!isFbeventsSdkReady()) {
    console.warn(
      "[Meta Pixel] fbevents.js did not become ready — events may not reach Meta (ad blocker / network).",
    );
    return false;
  }
  return true;
}

function fireStandardEvent(
  eventName: string,
  payload?: Record<string, unknown>,
  opts?: { eventID?: string },
): boolean {
  if (!window.fbq || !isFbeventsSdkReady()) return false;
  if (payload && opts) {
    window.fbq("track", eventName, payload, opts);
  } else if (opts) {
    window.fbq("track", eventName, {}, opts);
  } else if (payload) {
    window.fbq("track", eventName, payload);
  } else {
    window.fbq("track", eventName);
  }
  return true;
}

function fireStandardEventWithRetry(
  eventName: string,
  payload?: Record<string, unknown>,
  opts?: { eventID?: string },
  delaysMs = [0, 400, 1200, 2500, 5000],
): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);

  return new Promise((resolve) => {
    let sent = false;
    const tryFire = () => {
      if (sent) return;
      if (fireStandardEvent(eventName, payload, opts)) {
        sent = true;
        resolve(true);
      }
    };

    for (const delay of delaysMs) {
      window.setTimeout(tryFire, delay);
    }
    window.setTimeout(() => resolve(sent), delaysMs[delaysMs.length - 1]! + 200);
  });
}

/**
 * Init each pixel ID at most once per session.
 * Single-pixel pages use fbq('track', …) after init (Pixel Helper compatible).
 */
async function ensurePixelInitialized(
  pixelId: string,
  am?: MetaPixelAdvancedMatchingPayload,
): Promise<void> {
  const id = normalizeMetaPixelId(pixelId);
  if (!id) return;

  await ensureFbeventsLoaded();
  if (typeof window === "undefined" || !window.fbq) return;

  window.__metaPixelInitialized = window.__metaPixelInitialized || {};
  if (window.__metaPixelInitialized[id]) {
    return;
  }

  const hasAm = Boolean(am && Object.keys(am).length > 0);
  if (hasAm) {
    window.fbq("init", id, am as Record<string, unknown>);
  } else {
    window.fbq("init", id);
  }
  window.__metaPixelInitialized[id] = true;
}

async function ensurePixelReady(pixelId?: string | null): Promise<string | null> {
  const id = pixelId ? resolvePublicMetaPixelId(pixelId) : resolvePublicMetaPixelId(null);
  if (!id) {
    console.warn(
      "[Meta Pixel] No pixel ID — set meta_pixel_id on the product in Admin, or NEXT_PUBLIC_META_PIXEL_ID (redeploy after env change).",
    );
    return null;
  }
  await ensurePixelInitialized(id);
  await waitForPixelSdk();
  return id;
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

export function syncMetaPixelAdvancedMatching(
  pixelId: string | null | undefined,
  input: { phone: string; customerName: string },
) {
  const id = resolvePublicMetaPixelId(pixelId);
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
  const pageViewSentRef = useRef(false);
  const missingPixelWarnedRef = useRef(false);

  const resolvedPixelId = useMemo(
    () => resolvePublicMetaPixelId(pixelId),
    [pixelId],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!resolvedPixelId) {
      setStorageAm({});
      if (mounted && !missingPixelWarnedRef.current) {
        missingPixelWarnedRef.current = true;
        console.warn(
          "[Meta Pixel] No pixel ID — set meta_pixel_id in Admin → Integrations, or NEXT_PUBLIC_META_PIXEL_ID on Netlify (then redeploy).",
        );
      }
      return;
    }
    try {
      const raw = sessionStorage.getItem(metaPixelAmStorageKey(resolvedPixelId));
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
  }, [resolvedPixelId, mounted]);

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

  const initAmRef = useRef(initAdvancedMatching);
  initAmRef.current = initAdvancedMatching;

  const storageReady = storageAm !== null;

  useEffect(() => {
    if (!resolvedPixelId || !mounted || !storageReady || pageViewSentRef.current) return;

    let cancelled = false;

    void (async () => {
      await ensurePixelInitialized(resolvedPixelId, initAmRef.current);
      if (cancelled || pageViewSentRef.current) return;
      const sent = await fireStandardEventWithRetry("PageView");
      if (!cancelled && sent) {
        pageViewSentRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedPixelId, mounted, storageReady]);

  if (!resolvedPixelId || !mounted || !storageReady) return null;

  return (
    <>
      <div
        data-meta-pixel-id={resolvedPixelId}
        data-meta-pixel-ready={pageViewSentRef.current ? "true" : "false"}
        aria-hidden
        className="hidden"
      />
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${encodeURIComponent(resolvedPixelId)}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}

export function trackInitiateCheckout(eventId: string, pixelId?: string | null) {
  void (async () => {
    const id = await ensurePixelReady(pixelId);
    if (!id) return;
    await fireStandardEventWithRetry("InitiateCheckout", {}, { eventID: eventId });
  })();
}

export function trackPurchase(params: {
  eventId: string;
  valueMru: number;
  currency?: string;
}) {
  void (async () => {
    const ready = await waitForPixelSdk();
    if (!ready || typeof window === "undefined" || !window.fbq) return;
    const { value, currency } = toMetaPixelPurchaseMoney(
      params.valueMru,
      params.currency ?? "MRU",
    );
    fireStandardEvent("Purchase", { value, currency }, { eventID: params.eventId });
  })();
}

export async function trackLead(params: {
  value: number;
  currency: string;
  eventId: string;
  pixelId?: string | null;
}): Promise<void> {
  const id = await ensurePixelReady(params.pixelId);
  if (!id) return;
  const { value, currency } = toMetaPixelPurchaseMoney(params.value, params.currency);
  await fireStandardEventWithRetry("Lead", { value, currency }, { eventID: params.eventId });
}
