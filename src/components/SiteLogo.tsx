"use client";

import Image from "next/image";
import { BRAND_NAME, SITE_LOGO_FRAME_CLASS, SITE_LOGO_URL } from "@/lib/site-branding";

type Props = {
  className?: string;
  priority?: boolean;
  /** Use `""` when the link already has a screen-reader label (e.g. admin nav). */
  alt?: string;
  /** Defaults to the fixed storefront logo URL. */
  src?: string;
  /** `end` matches the landing header (logo toward the outer edge); `start` for the default storefront header. */
  objectAlign?: "start" | "end";
};

export function SiteLogo({
  className,
  priority,
  alt = BRAND_NAME,
  src = SITE_LOGO_URL,
  objectAlign = "start",
}: Props) {
  const objectClass = objectAlign === "end" ? "object-right" : "object-left";
  return (
    <span className={`relative ${SITE_LOGO_FRAME_CLASS} ${className ?? ""}`}>
      <Image
        src={src}
        alt={alt}
        fill
        className={`object-contain ${objectClass}`}
        sizes="(max-width: 640px) 42vw, 180px"
        priority={priority}
      />
    </span>
  );
}
