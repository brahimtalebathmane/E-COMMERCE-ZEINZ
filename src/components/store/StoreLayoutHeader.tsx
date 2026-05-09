"use client";

import { usePathname } from "next/navigation";
import { StoreHeader } from "@/components/store/StoreHeader";

/**
 * Store layout includes a global header. Product landing pages (`/[slug]`) render
 * their own {@link LandingHeader}, so we omit the store header there to avoid duplicate top bars.
 */
export function StoreLayoutHeader() {
  const pathname = usePathname();
  if (!pathname) return <StoreHeader />;

  if (pathname === "/") return <StoreHeader />;
  if (pathname.startsWith("/order-success")) return <StoreHeader />;

  return null;
}
