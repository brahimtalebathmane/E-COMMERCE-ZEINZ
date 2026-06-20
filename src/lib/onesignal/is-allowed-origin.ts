import { DEFAULT_PUBLIC_SITE_URL } from "@/lib/site-url";

/** Production hostname — must match OneSignal → Settings → Platforms → Web. */
export const ONESIGNAL_CONFIGURED_HOSTNAME = "zeinee.com";

function hostnameFromUrl(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    return new URL(raw.trim()).hostname;
  } catch {
    return null;
  }
}

/** Hostnames where OneSignal Web SDK init is attempted (must also exist in OneSignal dashboard). */
export function getOneSignalAllowedHostnames(): string[] {
  const hostnames = new Set<string>([
    ONESIGNAL_CONFIGURED_HOSTNAME,
    "zeina-ecomerce.netlify.app",
    "localhost",
    "127.0.0.1",
  ]);

  for (const candidate of [
    process.env.NEXT_PUBLIC_SITE_URL,
    DEFAULT_PUBLIC_SITE_URL,
  ]) {
    const hostname = hostnameFromUrl(candidate);
    if (hostname) hostnames.add(hostname);
  }

  return [...hostnames];
}

export function isOneSignalAllowedOrigin(origin?: string): boolean {
  if (typeof window === "undefined" && !origin) return false;

  const currentOrigin =
    origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  if (!currentOrigin) return false;

  let hostname: string;
  try {
    hostname = new URL(currentOrigin).hostname;
  } catch {
    return false;
  }

  return getOneSignalAllowedHostnames().includes(hostname);
}
