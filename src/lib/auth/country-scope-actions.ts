"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { assertAdminUser } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_COUNTRY_COOKIE } from "@/lib/auth/country-scope";

export type SetAdminCountryResult = { ok: true } | { ok: false; error: string };

export async function setAdminCountryAction(countryId: string): Promise<SetAdminCountryResult> {
  try {
    await assertAdminUser();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("countries_public")
    .select("id")
    .eq("id", countryId)
    .maybeSingle();

  if (!data) {
    return { ok: false, error: "Invalid country" };
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COUNTRY_COOKIE, countryId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/admin/products");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/analytics");
  return { ok: true };
}
