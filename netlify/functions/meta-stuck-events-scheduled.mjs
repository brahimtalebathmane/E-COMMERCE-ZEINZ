/**
 * Netlify scheduled function — runs every 30 minutes.
 * Calls the Next.js cron route with CRON_SECRET.
 */
export default async function handler() {
  const siteUrl = (process.env.URL || process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const secret = process.env.CRON_SECRET?.trim();

  if (!siteUrl || !secret) {
    console.error("[meta-stuck-events-scheduled] Missing URL or CRON_SECRET");
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: "missing_config" }),
    };
  }

  try {
    const res = await fetch(`${siteUrl}/api/cron/meta-stuck-events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await res.text();
    return {
      statusCode: res.status,
      body,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[meta-stuck-events-scheduled]", message);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: message }),
    };
  }
}

export const schedule = "*/30 * * * *";
