export const DEFAULT_PUBLIC_SITE_URL = "http://zeinee.com";

export function getPublicSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.URL?.trim() ||
    process.env.DEPLOY_PRIME_URL?.trim() ||
    DEFAULT_PUBLIC_SITE_URL;
  return raw.replace(/\/$/, "");
}

/** Client-safe base URL for admin previews (`NEXT_PUBLIC_*` only). */
export function getPublicSiteUrlClient(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_PUBLIC_SITE_URL;
  return raw.replace(/\/$/, "");
}
