"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import {
  ONESIGNAL_ADMIN_TAG_KEY,
  ONESIGNAL_ADMIN_TAG_VALUE,
  ONESIGNAL_APP_ID,
  ONESIGNAL_SAFARI_WEB_ID,
} from "@/lib/onesignal/constants";

function queueOneSignalInit() {
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OneSignal) => {
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
