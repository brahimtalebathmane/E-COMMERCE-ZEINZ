"use client";

import Image from "next/image";
import { SITE_LOGO_URL } from "@/lib/site-branding";

type Props = {
  className?: string;
  priority?: boolean;
};

export function SiteLogo({ className, priority }: Props) {
  return (
    <span
      className={`relative inline-block h-9 w-[min(100%,220px)] sm:h-10 ${className ?? ""}`}
    >
      <Image
        src={SITE_LOGO_URL}
        alt="E-Commerce Zeina"
        fill
        className="object-contain object-start"
        sizes="220px"
        priority={priority}
      />
    </span>
  );
}
