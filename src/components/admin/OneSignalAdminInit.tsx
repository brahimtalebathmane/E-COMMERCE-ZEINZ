"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import {
  ONESIGNAL_ADMIN_TAG_KEY,
  ONESIGNAL_ADMIN_TAG_VALUE,
  ONESIGNAL_APP_ID,
  ONESIGNAL_SAFARI_WEB_ID,
} from "@/lib/onesignal/constants";
import {
  ONESIGNAL_CONFIGURED_HOSTNAME,
  isOneSignalAllowedOrigin,
} from "@/lib/onesignal/is-allowed-origin";

function queueOneSignalInit() {
  if (!isOneSignalAllowedOrigin()) {
    console.warn(
      "[OneSignal] Skipped on this domain. Use an allowed hostname or add it in OneSignal → Settings → Platforms → Web.",
      { hostname: window.location.hostname, configured: ONESIGNAL_CONFIGURED_HOSTNAME },
    );
    return;
  }

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OneSignal) => {
    try {
      await OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        safari_web_id: ONESIGNAL_SAFARI_WEB_ID,
        notifyButton: {
          enable: true,
        },
        serviceWorkerPath: "/sw.js",
        ...(process.env.NODE_ENV === "development"
          ? { allowLocalhostAsSecureOrigin: true }
          : {}),
      });
      OneSignal.User.addTag(ONESIGNAL_ADMIN_TAG_KEY, ONESIGNAL_ADMIN_TAG_VALUE);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[OneSignal] Init failed:", message);
    }
  });
}

export function OneSignalAdminInit() {
  const queued = useRef(false);

  const ensureQueued = () => {
    if (queued.current) return;
    queued.current = true;
    queueOneSignalInit();
  };

  useEffect(() => {
    ensureQueued();
  }, []);

  return (
    <Script
      src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
      strategy="afterInteractive"
      onLoad={ensureQueued}
    />
  );
}
