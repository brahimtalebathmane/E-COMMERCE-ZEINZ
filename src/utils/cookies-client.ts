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
  const fbc = getClientCookie("_fbc")?.trim();
  return {
    ...(fbp ? { fbp } : null),
    ...(fbc ? { fbc } : null),
  };
}

