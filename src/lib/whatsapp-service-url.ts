/**
 * Base URL for the always-on Node service that exposes POST /api/send-whatsapp (and OTP routes).
 *
 * - **Netlify / split deploy:** set `WHATSAPP_SERVICE_URL` to the public HTTPS origin (e.g. Render), no trailing slash.
 * **Same host (Render `server.js`):** when `RENDER=true`, defaults to loopback so you do not have to set the public URL twice.
 */
export function resolveWhatsAppServiceBase(): string | null {
  const explicit = (process.env.WHATSAPP_SERVICE_URL || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;

  const onNetlify =
    process.env.NETLIFY === "true" || Boolean(process.env.NETLIFY_DEV);
  if (onNetlify) return null;

  const useLoopback =
    process.env.WHATSAPP_USE_LOOPBACK === "1" || process.env.RENDER === "true";
  if (!useLoopback) return null;

  const port = process.env.PORT || "3000";
  return `http://127.0.0.1:${port}`;
}
