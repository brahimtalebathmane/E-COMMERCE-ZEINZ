"use client";

import { useEffect, useMemo, useState } from "react";
import Script from "next/script";
import { toMetaPixelPurchaseMoney } from "@/lib/currency";
import {
  META_PURCHASE_TRACKING_CURRENCY,
  META_PURCHASE_TRACKING_VALUE,
} from "@/lib/meta-purchase-tracking";
import {
  buildMetaPixelAdvancedMatching,
  metaPixelAmStorageKey,
  type MetaPixelAdvancedMatchingPayload,
} from "@/lib/meta-pixel-advanced-matching";

declare global {
  interface Window {
    fbq?: (
      action: string,
      arg2?: string,
      arg3?: Record<string, unknown> | string,
      arg4?: Record<string, unknown>,
    ) => void;
    _fbq?: unknown;
    __metaPixelInitialized?: Record<string, boolean>;
  }
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
 * Safe if fbq is not loaded yet (no-op, same as existing track* guards).
 */
export function syncMetaPixelAdvancedMatching(
  pixelId: string | null | undefined,
  input: { phone: string; customerName: string },
) {
  const id = pixelId?.trim();
  if (!id || typeof window === "undefined") return;
  const am = buildMetaPixelAdvancedMatching(input);
  if (!am || !window.fbq) return;
  window.fbq("set", "userData", am as Record<string, unknown>);
}

export function MetaPixel({ pixelId, advancedMatching }: Props) {
  const [mounted, setMounted] = useState(false);
  const [storageAm, setStorageAm] = useState<MetaPixelAdvancedMatchingPayload | null>(
    null,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const id = pixelId?.trim();
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

  const id = pixelId?.trim();
  const storageReady = storageAm !== null;

  if (!id || !mounted || !storageReady) return null;

  const amJson = JSON.stringify(initAdvancedMatching ?? {});

  return (
    <>
      <Script
        id="fb-pixel"
        strategy="lazyOnload"
        dangerouslySetInnerHTML={{
          __html: `
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            var __pid = ${JSON.stringify(id)};
            var __am = ${amJson};
            window.__metaPixelInitialized = window.__metaPixelInitialized || {};
            if (!window.__metaPixelInitialized[__pid]) {
              var __keys = __am && typeof __am === 'object' ? Object.keys(__am) : [];
              if (__keys.length > 0) {
                fbq('init', __pid, __am);
              } else {
                fbq('init', __pid);
              }
              window.__metaPixelInitialized[__pid] = true;
            }
            fbq('track', 'PageView');
          `,
        }}
      />
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
    </>
  );
}

export function trackInitiateCheckout(eventId: string) {
  if (typeof window === "undefined" || !window.fbq) return;
  window.fbq("track", "InitiateCheckout", {}, { eventID: eventId });
}

/** Purchase Pixel payload matches CAPI: fixed 25 USD (not real MRU order total). */
export function trackPurchase(params: { eventId: string }) {
  if (typeof window === "undefined" || !window.fbq) return;
  window.fbq(
    "track",
    "Purchase",
    {
      value: META_PURCHASE_TRACKING_VALUE,
      currency: META_PURCHASE_TRACKING_CURRENCY,
    },
    { eventID: params.eventId },
  );
}

export function trackLead(params: {
  value: number;
  currency: string;
  eventId: string;
}) {
  if (typeof window === "undefined" || !window.fbq) return;
  const { value, currency } = toMetaPixelPurchaseMoney(params.value, params.currency);
  window.fbq(
    "track",
    "Lead",
    {
      value,
      currency,
    },
    { eventID: params.eventId },
  );
}
