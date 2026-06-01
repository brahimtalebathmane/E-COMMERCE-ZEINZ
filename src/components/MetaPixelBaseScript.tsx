import Script from "next/script";
import { normalizeMetaPixelId } from "@/lib/meta-pixel-id";

type Props = {
  pixelId: string | null | undefined;
};

declare global {
  interface Window {
    __metaPixelsInited?: Record<string, boolean>;
  }
}

/**
 * Meta’s official fbevents bootstrap + per-pixel init (via next/script).
 * Safe to call on every store page; duplicate pixel IDs are skipped.
 * Pixel Helper detects this — React-only injection does not.
 */
export function MetaPixelBaseScript({ pixelId }: Props) {
  const id = normalizeMetaPixelId(pixelId);
  if (!id) return null;

  const initSnippet = `
(function(pixelId){
  if(!window.fbq){
    !function(f,b,e,v,n,t,s){
      if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)
    }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
  }
  window.__metaPixelsInited=window.__metaPixelsInited||{};
  if(window.__metaPixelsInited[pixelId])return;
  fbq('init',pixelId);
  fbq('track','PageView');
  window.__metaPixelsInited[pixelId]=true;
})('${id}');
`.trim();

  return (
    <>
      <Script id={`meta-pixel-${id}`} strategy="afterInteractive">
        {initSnippet}
      </Script>
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
