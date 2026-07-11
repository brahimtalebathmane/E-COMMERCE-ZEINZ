import { NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/auth/api-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { fetchMetaEventLogPage } from "@/app/admin/(dashboard)/meta/queries";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/meta-events — paginated meta_event_log for admin monitoring.
 */
export async function GET(request: Request) {
  const auth = await requirePermissionApi(PERMISSIONS.view_meta_monitoring);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "50");

  try {
    const supabase = await createClient();
    const result = await fetchMetaEventLogPage(supabase, {
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 50,
      eventType: url.searchParams.get("eventType") ?? undefined,
      state: url.searchParams.get("state") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
