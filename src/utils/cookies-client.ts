const FBC_STORAGE_KEY = "meta_derived_fbc";

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
 * Meta `_fbc` from cookie, or derived from `fbclid` query param per Meta format:
 * `fb.{subdomain_index}.{creation_time}.{fbclid}`
 */
function resolveFbc(): string | undefined {
  const fromCookie = getClientCookie("_fbc")?.trim();
  if (fromCookie) return fromCookie;

  if (typeof window === "undefined") return undefined;

  try {
    const stored = sessionStorage.getItem(FBC_STORAGE_KEY)?.trim();
    if (stored) return stored;
  } catch {
    // ignore
  }

  const fbclid = readFbclidFromLocation();
  if (!fbclid) return undefined;

  const derived = `fb.1.${Date.now()}.${fbclid}`;
  try {
    sessionStorage.setItem(FBC_STORAGE_KEY, derived);
  } catch {
    // ignore
  }
  return derived;
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
