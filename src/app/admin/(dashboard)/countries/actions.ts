"use server";

import { revalidatePath } from "next/cache";
import { assertOwnerUser } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import type { CountryRow } from "@/types";

export type CountryActionResult = { ok: true } | { ok: false; error: string };

export type CountryInput = {
  name_ar: string;
  name_fr: string;
  iso_code: string;
  currency: string;
  meta_pixel_id_public: string;
  meta_pixel_id_server: string;
  is_active: boolean;
};

function normalizeInput(input: CountryInput) {
  return {
    name_ar: input.name_ar.trim(),
    name_fr: input.name_fr.trim(),
    iso_code: input.iso_code.trim().toUpperCase(),
    currency: input.currency.trim().toUpperCase(),
    meta_pixel_id_public: input.meta_pixel_id_public.trim() || null,
    meta_pixel_id_server: input.meta_pixel_id_server.trim() || null,
    is_active: input.is_active,
  };
}

function validate(input: ReturnType<typeof normalizeInput>): string | null {
  if (!input.name_ar) return "الاسم بالعربية مطلوب.";
  if (!input.name_fr) return "الاسم بالفرنسية مطلوب.";
  if (!/^[A-Z]{2}$/.test(input.iso_code)) {
    return "رمز الدولة يجب أن يكون حرفين (مثال: MR).";
  }
  if (!/^[A-Z]{3}$/.test(input.currency)) {
    return "رمز العملة يجب أن يكون 3 أحرف (مثال: MRU).";
  }
  return null;
}

/** Postgres unique-violation code, used for a friendly duplicate-ISO-code message. */
const UNIQUE_VIOLATION_CODE = "23505";
/** Postgres foreign-key-violation code — a product still references this country. */
const FK_VIOLATION_CODE = "23503";

export async function listCountriesAction(): Promise<CountryRow[]> {
  await assertOwnerUser();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("countries")
    .select("*")
    .order("name_ar");

  if (error) throw new Error(error.message);
  return (data ?? []) as CountryRow[];
}

export async function createCountryAction(input: CountryInput): Promise<CountryActionResult> {
  try {
    await assertOwnerUser();
    const normalized = normalizeInput(input);
    const validationError = validate(normalized);
    if (validationError) return { ok: false, error: validationError };

    const supabase = createServiceClient();
    const { error } = await supabase.from("countries").insert(normalized);

    if (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION_CODE) {
        return { ok: false, error: "يوجد بالفعل دولة بهذا الرمز." };
      }
      return { ok: false, error: error.message };
    }

    revalidatePath("/admin/countries");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "فشل الحفظ." };
  }
}

export async function updateCountryAction(
  id: string,
  input: CountryInput,
): Promise<CountryActionResult> {
  try {
    await assertOwnerUser();
    const normalized = normalizeInput(input);
    const validationError = validate(normalized);
    if (validationError) return { ok: false, error: validationError };

    const supabase = createServiceClient();
    const { error } = await supabase
      .from("countries")
      .update({ ...normalized, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION_CODE) {
        return { ok: false, error: "يوجد بالفعل دولة بهذا الرمز." };
      }
      return { ok: false, error: error.message };
    }

    revalidatePath("/admin/countries");
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "فشل الحفظ." };
  }
}

export async function deleteCountryAction(id: string): Promise<CountryActionResult> {
  try {
    await assertOwnerUser();
    const supabase = createServiceClient();
    const { error } = await supabase.from("countries").delete().eq("id", id);

    if (error) {
      if ((error as { code?: string }).code === FK_VIOLATION_CODE) {
        return {
          ok: false,
          error: "لا يمكن حذف هذه الدولة لأن منتجات مرتبطة بها. يمكنك إيقافها بدل الحذف.",
        };
      }
      return { ok: false, error: error.message };
    }

    revalidatePath("/admin/countries");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "فشل الحذف." };
  }
}
