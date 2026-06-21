"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
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

type SubState = "unknown" | "unsupported" | "blocked" | "default" | "subscribed";

function readState(OneSignal: OneSignalClient): SubState {
  try {
    if (!OneSignal.Notifications.isPushSupported()) return "unsupported";
    if (OneSignal.User?.PushSubscription?.optedIn) return "subscribed";
    if (OneSignal.Notifications.permissionNative === "denied") return "blocked";
    return "default";
  } catch {
    return "unknown";
  }
}

export function OneSignalAdminInit() {
  const queued = useRef(false);
  const [state, setState] = useState<SubState>("unknown");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback((OneSignal: OneSignalClient) => {
    setState(readState(OneSignal));
  }, []);

  const ensureInit = useCallback(() => {
    if (queued.current) return;
    if (!isOneSignalAllowedOrigin()) {
      console.error(
        "[OneSignal] Skipped — current host is not in the allowed list. Add it in OneSignal → Settings → Platforms → Web, then to getOneSignalAllowedHostnames().",
        { hostname: window.location.hostname, configured: ONESIGNAL_CONFIGURED_HOSTNAME },
      );
      return;
    }
    queued.current = true;

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        // Temporary verbose logging to surface domain/permission/config errors.
        OneSignal.Debug?.setLogLevel?.("trace");

        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          safari_web_id: ONESIGNAL_SAFARI_WEB_ID,
          notifyButton: { enable: true },
          // Dedicated scope so OneSignal never collides with the Serwist PWA worker at "/sw.js".
          serviceWorkerPath: "/push/OneSignalSDKWorker.js",
          serviceWorkerParam: { scope: "/push/" },
          ...(process.env.NODE_ENV === "development"
            ? { allowLocalhostAsSecureOrigin: true }
            : {}),
        });

        OneSignal.User.addTag(ONESIGNAL_ADMIN_TAG_KEY, ONESIGNAL_ADMIN_TAG_VALUE);
        OneSignal.Notifications.addEventListener("permissionChange", () => refresh(OneSignal));
        OneSignal.User.PushSubscription.addEventListener("change", () => refresh(OneSignal));
        // Mobile-side delivery tracking hooks: confirm in the device console that transactional
        // pushes actually reach this client (foreground) and that taps route correctly. These
        // surface the final leg of the server-to-client chain so no step resolves silently.
        OneSignal.Notifications.addEventListener("foregroundWillDisplay", (event) => {
          console.info("[OneSignal] push received while app in foreground", event);
        });
        OneSignal.Notifications.addEventListener("click", (event) => {
          console.info("[OneSignal] notification clicked", event);
        });
        refresh(OneSignal);
        console.info(
          "[OneSignal] Initialized on",
          window.location.hostname,
          "| pushSupported:",
          OneSignal.Notifications.isPushSupported(),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          "[OneSignal] Init failed:",
          message,
          "— verify OneSignal → Settings → Platforms → Web → Site URL exactly matches",
          window.location.origin,
        );
      }
    });
  }, [refresh]);

  useEffect(() => {
    ensureInit();
  }, [ensureInit]);

  const handleEnable = useCallback(() => {
    setBusy(true);
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        // Must run inside this user gesture for iOS 16.4+ installed PWAs.
        await OneSignal.Notifications.requestPermission();
        // Explicitly opt in unless already subscribed. On a fresh mobile grant `optedIn`
        // is often `undefined` (not `false`), so a `=== false` check would skip opt-in and
        // never register a subscription/Player ID — leaving OneSignal with no recipients.
        if (OneSignal.User?.PushSubscription?.optedIn !== true) {
          await OneSignal.User.PushSubscription.optIn();
        }
        OneSignal.User.addTag(ONESIGNAL_ADMIN_TAG_KEY, ONESIGNAL_ADMIN_TAG_VALUE);
        refresh(OneSignal);
        console.info(
          "[OneSignal] opt-in complete | optedIn:",
          OneSignal.User?.PushSubscription?.optedIn,
          "| subscriptionId:",
          OneSignal.User?.PushSubscription?.id ?? null,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[OneSignal] requestPermission failed:", message);
      } finally {
        setBusy(false);
      }
    });
  }, [refresh]);

  return (
    <>
      <Script
        src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
        strategy="afterInteractive"
        onLoad={ensureInit}
      />
      {(state === "default" || state === "blocked") && (
        <div className="fixed bottom-4 start-4 z-50">
          <button
            type="button"
            onClick={handleEnable}
            disabled={busy || state === "blocked"}
            className="rounded-full bg-[var(--accent,#111)] px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state === "blocked"
              ? "الإشعارات محظورة — فعّلها من إعدادات المتصفح"
              : busy
                ? "جاري التفعيل…"
                : "تفعيل إشعارات الطلبات"}
          </button>
        </div>
      )}
    </>
  );
}
