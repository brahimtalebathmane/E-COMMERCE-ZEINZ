/**
 * Base URL for the always-on Node service that exposes POST /api/send-whatsapp (and OTP routes).
 *
 * - **Netlify / split deploy:** set `WHATSAPP_SERVICE_URL` to the public HTTPS origin (e.g. Railway), no trailing slash.
 * **Same host (`server.js` on Railway):** when `RAILWAY_ENVIRONMENT` (or related) is set, defaults to loopback so you do not have to set the public URL twice. `RENDER=true` is still honored for legacy deploys.
 */
function isRailwayDeploy(): boolean {
  return Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
}

export function resolveWhatsAppServiceBase(): string | null {
  const explicit = (process.env.WHATSAPP_SERVICE_URL || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;

  const onNetlify =
    process.env.NETLIFY === "true" || Boolean(process.env.NETLIFY_DEV);
  if (onNetlify) return null;

  const useLoopback =
    process.env.WHATSAPP_USE_LOOPBACK === "1" ||
    process.env.RENDER === "true" ||
    isRailwayDeploy();

  if (!useLoopback) return null;

  const port = process.env.PORT || "3000";
  return `http://127.0.0.1:${port}`;
}
