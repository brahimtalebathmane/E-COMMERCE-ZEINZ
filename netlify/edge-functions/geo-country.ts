import type { Context } from "netlify:edge";

/**
 * Stamps the visitor's detected country onto the request as a header, so the
 * homepage catalog (a Next.js Server Component, not middleware) can read it
 * via next/headers. Next.js 15 removed NextRequest.geo/.ip from core (a
 * Vercel-specific field Vercel itself dropped), so there is nothing to read
 * on the Next.js side without this — Netlify's documented geolocation
 * surface is context.geo on the raw Edge Functions API, not something the
 * Next.js Runtime auto-injects.
 *
 * Scoped to "/" only (see netlify.toml) — product landing pages must stay
 * reachable regardless of visitor location (ad clicks, shared links, QR
 * codes), so this deliberately does not run on /[slug].
 */
export default async (request: Request, context: Context) => {
  const countryCode = context.geo?.country?.code;
  if (!countryCode) {
    return context.next();
  }

  const forwarded = new Request(request, {
    headers: new Headers(request.headers),
  });
  forwarded.headers.set("x-visitor-country-code", countryCode);

  return context.next(forwarded);
};
