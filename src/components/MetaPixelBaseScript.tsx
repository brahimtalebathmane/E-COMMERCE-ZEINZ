import Script from "next/script";
import {
  buildMetaPixelFullSnippet,
  buildMetaPixelInitOnlySnippet,
} from "@/lib/meta-pixel-snippet";
import { normalizeMetaPixelId } from "@/lib/meta-pixel-id";

type Props = {
  pixelId: string | null | undefined;
  /** Use init-only when another script on the page already bootstrapped fbevents.js */
  variant?: "full" | "init-only";
};

/**
 * Injects Meta base code via beforeInteractive so it runs from document head
 * before React hydrates. Events queue on fbq until fbevents.js loads.
 */
export function MetaPixelBaseScript({ pixelId, variant = "full" }: Props) {
  const id = normalizeMetaPixelId(pixelId);
  if (!id) return null;

  const html =
    variant === "init-only"
      ? buildMetaPixelInitOnlySnippet(id)
      : buildMetaPixelFullSnippet(id);
  if (!html) return null;

  return (
    <>
      <Script
        id={`meta-pixel-${id}`}
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{ __html: html }}
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
