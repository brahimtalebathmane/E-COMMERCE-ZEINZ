"use client";

import { useEffect } from "react";
import { unregisterLegacyRootSerwist } from "@/lib/legacy-serwist-cleanup";

/** Removes legacy root-scoped Serwist so checkout navigations are not intercepted. */
export function StorefrontSerwistCleanup() {
  useEffect(() => {
    void unregisterLegacyRootSerwist();
  }, []);

  return null;
}
