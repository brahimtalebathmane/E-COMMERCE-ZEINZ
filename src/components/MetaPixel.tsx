"use client";

import Script from "next/script";
import { toMetaPixelPurchaseMoney } from "@/lib/currency";
import {
  META_PURCHASE_TRACKING_CURRENCY,
  META_PURCHASE_TRACKING_VALUE,
} from "@/lib/meta-purchase-tracking";

declare global {
  interface Window {
    fbq?: (
      action: string,
      event: string,
      params?: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => void;
    _fbq?: unknown;
  }
}

type Props = {
  pixelId: string | null | undefined;
};

export function MetaPixel({ pixelId }: Props) {
  if (!pixelId) return null;

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
            fbq('init', '${pixelId}');
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
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
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
