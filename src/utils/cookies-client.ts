const FBC_STORAGE_KEY = "meta_derived_fbc";
const FBC_STORAGE_ROUTE_KEY = "meta_derived_fbc_route";

function currentRouteKey(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}`;
}

function readFbclidFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const fbclid = params.get("fbclid")?.trim();
    return fbclid || null;
  } catch {
    return null;
  }
}

/**
 * Meta `_fbc` for CAPI advanced matching.
 * When `fbclid` is in the current URL, derive a fresh click id — it must win over a
 * stale `_fbc` cookie from an earlier ad/campaign click on the same browser.
 * Format: `fb.{subdomain_index}.{creation_time}.{fbclid}`
 */
function resolveFbc(): string | undefined {
  const fbclid = readFbclidFromLocation();
  if (fbclid) {
    const derived = `fb.1.${Date.now()}.${fbclid}`;
    try {
      sessionStorage.setItem(FBC_STORAGE_KEY, derived);
      sessionStorage.setItem(FBC_STORAGE_ROUTE_KEY, currentRouteKey());
    } catch {
      // ignore
    }
    return derived;
  }

  const fromCookie = getClientCookie("_fbc")?.trim();
  if (fromCookie) return fromCookie;

  if (typeof window === "undefined") return undefined;

  try {
    const stored = sessionStorage.getItem(FBC_STORAGE_KEY)?.trim();
    const storedRoute = sessionStorage.getItem(FBC_STORAGE_ROUTE_KEY);
    if (stored && storedRoute === currentRouteKey()) return stored;
  } catch {
    // ignore
  }

  return undefined;
}

export function getClientCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const n = name.trim();
  if (!n) return undefined;
  const cookies = document.cookie ? document.cookie.split(";") : [];
  for (const part of cookies) {
    const p = part.trim();
    if (!p) continue;
    if (!p.startsWith(`${n}=`)) continue;
    const raw = p.slice(n.length + 1);
    if (!raw) return undefined;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

export function getMetaBrowserCookies(): { fbp?: string; fbc?: string } {
  const fbp = getClientCookie("_fbp")?.trim();
  const fbc = resolveFbc();
  return {
    ...(fbp ? { fbp } : null),
    ...(fbc ? { fbc } : null),
  };
}
