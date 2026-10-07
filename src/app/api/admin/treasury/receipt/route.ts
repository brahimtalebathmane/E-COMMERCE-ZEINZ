import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requirePermissionApi } from "@/lib/auth/api-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getCountryScope } from "@/lib/auth/country-scope";
import { hasLocalOperations } from "@/lib/local-operations";

/**
 * Receipt photo/PDF for a treasury transaction. Stored in the PRIVATE
 * user-assets bucket (never public-assets: receipts are financial records);
 * pages show them through short-lived signed URLs (lib/treasury/data.ts).
 * Returns the storage path, which the transaction then references.
 */
const ALLOWED_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["application/pdf", "pdf"],
]);
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const admin = await requirePermissionApi(PERMISSIONS.manage_treasury);
  if (!admin.ok) return admin.response;

  const { selectedCountry } = await getCountryScope();
  if (!selectedCountry || !hasLocalOperations(selectedCountry)) {
    return NextResponse.json({ error: "Treasury exists only for the local-operations market." }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  const ext = ALLOWED_TYPES.get(file.type);
  if (!ext) {
    return NextResponse.json({ error: "JPG, PNG, WebP or PDF only." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File must be 5MB or smaller." }, { status: 400 });
  }

  const path = `treasury-receipts/${selectedCountry.id}/${Date.now()}-${randomUUID()}.${ext}`;
  const service = createServiceClient();
  const { error } = await service.storage
    .from("user-assets")
    .upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ path });
}
