import { NextResponse } from "next/server";
import { processStuckMetaEvents } from "@/lib/meta/stuck-events";
import { createServiceClient } from "@/lib/supabase/service";

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization")?.trim() ?? "";
  return auth === `Bearer ${secret}`;
}

/**
 * POST /api/cron/meta-stuck-events — detects orders with unsent Meta flags past threshold.
 * Secured via CRON_SECRET bearer token (Netlify scheduled function).
 */
export async function POST(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const result = await processStuckMetaEvents(supabase);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron/meta-stuck-events]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
