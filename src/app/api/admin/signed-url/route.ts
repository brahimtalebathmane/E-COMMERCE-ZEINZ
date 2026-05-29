import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminApi } from "@/lib/auth/api-access";
import { apiErrorResponse, apiValidationError } from "@/lib/api/errors";

export async function GET(request: Request) {
  const admin = await requireAdminApi();
  if (!admin.ok) {
    return admin.response;
  }

  const url = new URL(request.url);
  const path = url.searchParams.get("path");
  if (!path) {
    return apiValidationError("path required");
  }

  try {
    const service = createServiceClient();
    const { data, error } = await service.storage
      .from("user-assets")
      .createSignedUrl(path, 3600);

    if (error || !data?.signedUrl) {
      return apiErrorResponse(error ?? new Error("Failed"), "[GET /api/admin/signed-url]");
    }

    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (e) {
    return apiErrorResponse(e, "[GET /api/admin/signed-url]");
  }
}
