/** Fixed brand identity across full website and all landing pages. */
export const BRAND_COLOR = "#006B0C";

/** Canonical brand name shown in metadata and accessibility labels. */
export const BRAND_NAME = "ZAINE";

/** Public support email shown in site footer. */
export const SUPPORT_EMAIL = "support@zeinaa.net";

/**
 * Public site / admin header logo (PNG).
 * Hosted locally for reliability, offline PWA support, and consistent caching.
 * Source asset: logo-zeina.png (zeina wordmark).
 */
export const SITE_LOGO_URL = "/icons/logo-zeina.png";

/**
 * Same viewport-relative frame as the landing header so the storefront and admin
 * match landing scale and cropping.
 */
export const SITE_LOGO_FRAME_CLASS =
  "block h-10 w-[min(42vw,9.5rem)] shrink-0 sm:h-11 sm:w-[min(38vw,11rem)] md:w-[min(36vw,12rem)]";
