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
    console.error(
      "[OneSignal] Skipped — current host is not in the allowed list. Add it in OneSignal → Settings → Platforms → Web, then to getOneSignalAllowedHostnames().",
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
        // Dedicated scope so OneSignal never collides with the Serwist PWA worker at "/sw.js".
        serviceWorkerPath: "/push/OneSignalSDKWorker.js",
        serviceWorkerParam: { scope: "/push/" },
        ...(process.env.NODE_ENV === "development"
          ? { allowLocalhostAsSecureOrigin: true }
          : {}),
      });
      OneSignal.User.addTag(ONESIGNAL_ADMIN_TAG_KEY, ONESIGNAL_ADMIN_TAG_VALUE);
      console.info("[OneSignal] Initialized on", window.location.hostname);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        "[OneSignal] Init failed:",
        message,
        "— check that OneSignal → Settings → Platforms → Web → Site URL exactly matches",
        window.location.origin,
      );
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
