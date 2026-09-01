const FBC_STORAGE_KEY = "meta_derived_fbc";
const FBC_COOKIE_NAME = "zn_fbc";
const FBC_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60; // 90 days

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

function readLocalStorageValue(key: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return localStorage.getItem(key)?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function writeLocalStorageValue(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore quota / private mode
  }
}

function setClientCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof window === "undefined") return;
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax${secure}`;
  } catch {
    // ignore
  }
}

/** Persists a derived `fbc` value to BOTH localStorage and a first-party cookie. */
function persistDerivedFbc(value: string): void {
  writeLocalStorageValue(FBC_STORAGE_KEY, value);
  setClientCookie(FBC_COOKIE_NAME, value, FBC_COOKIE_MAX_AGE_SECONDS);
}

/** Extracts the embedded creation-time ms from `fb.{subdomain_index}.{creation_time}.{fbclid}`, or null. */
function fbcTimestamp(value: string | undefined): number | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length < 4) return null;
  const ts = Number(parts[2]);
  return Number.isFinite(ts) ? ts : null;
}

/**
 * Meta `_fbc` for CAPI advanced matching.
 * When `fbclid` is in the current URL, derive a fresh click id — it must win over a
 * stale `_fbc` cookie from an earlier ad/campaign click on the same browser. The
 * derived value is mirrored to localStorage + a first-party `zn_fbc` cookie (90-day
 * max-age) so it survives in-site navigation, unlike the old route-keyed sessionStorage
 * entry it replaces.
 * Format: `fb.{subdomain_index}.{creation_time}.{fbclid}`
 */
function resolveFbc(): string | undefined {
  const fbclid = readFbclidFromLocation();
  if (fbclid) {
    const derived = `fb.1.${Date.now()}.${fbclid}`;
    persistDerivedFbc(derived);
    return derived;
  }

  const fromCookie = getClientCookie("_fbc")?.trim();
  const fromMirror = readLocalStorageValue(FBC_STORAGE_KEY) ?? getClientCookie(FBC_COOKIE_NAME)?.trim();

  if (fromCookie && fromMirror) {
    const cookieTs = fbcTimestamp(fromCookie);
    const mirrorTs = fbcTimestamp(fromMirror);
    if (cookieTs != null && mirrorTs != null) {
      return mirrorTs > cookieTs ? fromMirror : fromCookie;
    }
    return fromCookie;
  }

  return fromCookie || fromMirror || undefined;
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
