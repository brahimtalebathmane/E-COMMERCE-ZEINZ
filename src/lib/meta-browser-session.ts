import { getMetaBrowserCookies } from "@/utils/cookies-client";

export type MetaBrowserSessionData = {
  fbp?: string;
  fbc?: string;
  client_user_agent?: string;
};

/** Browser-side session fields for Pixel advanced matching (fbp, fbc, UA). IP is captured by Meta on ingest. */
export function getMetaBrowserSessionData(): MetaBrowserSessionData {
  const cookies = getMetaBrowserCookies();
  const out: MetaBrowserSessionData = {};
  if (cookies.fbp) out.fbp = cookies.fbp;
  if (cookies.fbc) out.fbc = cookies.fbc;
  if (typeof navigator !== "undefined" && navigator.userAgent?.trim()) {
    out.client_user_agent = navigator.userAgent.trim();
  }
  return out;
}

/** Payload for `fbq("set", "userData", …)` — only non-empty Meta-recognized keys. */
export function buildMetaPixelSessionUserData(
  session?: MetaBrowserSessionData,
): Record<string, string> | undefined {
  const src = session ?? getMetaBrowserSessionData();
  const out: Record<string, string> = {};
  if (src.fbp) out.fbp = src.fbp;
  if (src.fbc) out.fbc = src.fbc;
  return Object.keys(out).length > 0 ? out : undefined;
}
